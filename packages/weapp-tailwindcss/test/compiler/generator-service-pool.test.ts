import type { TailwindResolvedSource, WeappTailwindcssGenerateOptions, WeappTailwindcssGenerateResult } from '@/generator/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompilerGeneratorServicePool } from '@/core/compiler/generator-service-pool'

const source: TailwindResolvedSource = { css: '@tailwind utilities;', base: process.cwd(), projectRoot: process.cwd(), baseFallbacks: [], dependencies: [], sources: [] }
const options = { target: 'weapp' as const, scanSources: false }
const pools: CompilerGeneratorServicePool[] = []
function result(candidates: Iterable<string> = []): WeappTailwindcssGenerateResult {
  return { css: [...candidates].join(' '), rawCss: [...candidates].join(' '), incrementalCss: 'delta', incrementalRawCss: 'raw delta', classSet: new Set(candidates), rawCandidates: new Set(candidates), dependencies: ['config.ts'], sources: [{ base: process.cwd(), pattern: '**/*.html' }], root: null, target: 'weapp', customPropertyValues: new Map([['--color', 'red']]) }
}
function setup() {
  const factory = vi.fn((input: TailwindResolvedSource) => ({
    source: input,
    generate: vi.fn(async (request?: WeappTailwindcssGenerateOptions) => result(request?.candidates)),
    loadDesignSystem: vi.fn(),
    validateCandidates: vi.fn(async (candidates: Iterable<string>) => new Set(candidates)),
    dispose: vi.fn(async () => {}),
  }))
  const pool = new CompilerGeneratorServicePool(factory)
  pools.push(pool)
  return { pool, factory }
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

afterEach(async () => {
  await Promise.all(pools.splice(0).map(pool => pool.dispose()))
})

describe('生成服务租约', () => {
  it('共享服务按候选请求串行，单租约释放保留其他引用，最后引用等待在途工作', async () => {
    const { pool, factory } = setup()
    const first = pool.acquire(source, options)
    const second = pool.acquire(source, options)
    const engine = factory.mock.results[0]!.value
    const gate = deferred()
    engine.generate.mockImplementationOnce(async (request) => {
      await gate.promise
      return result(request?.candidates)
    })
    const a = first.generate({ ...options, candidates: ['a'] })
    const b = second.generate({ ...options, candidates: ['b'] })
    await Promise.resolve()
    expect(engine.generate).toHaveBeenCalledTimes(1)
    const closing = first.dispose!()
    expect(first.dispose!()).toBe(closing)
    expect(engine.dispose).not.toHaveBeenCalled()
    gate.resolve()
    expect((await a).classSet).toEqual(new Set(['a']))
    expect((await b).classSet).toEqual(new Set(['b']))
    await closing
    expect(engine.dispose).not.toHaveBeenCalled()
    await second.dispose!()
    expect(engine.dispose).toHaveBeenCalledTimes(1)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('验证候选在接受调用时复制，排队期间调用方修改集合不改变请求', async () => {
    const { pool, factory } = setup()
    const lease = pool.acquire(source, options)
    const engine = factory.mock.results[0]!.value
    const gate = deferred()
    engine.generate.mockImplementationOnce(async () => {
      await gate.promise
      return result()
    })
    const generating = lease.generate(options)
    const candidates = new Set(['before'])
    const validating = lease.validateCandidates(candidates)
    candidates.clear()
    candidates.add('after')
    gate.resolve()
    await generating
    expect(await validating).toEqual(new Set(['before']))
  })

  it.each(['/project/styles', 'C:\\project\\styles', 'C:\\', '/', './styles'])('来源身份保留文件系统边界：%s', (base) => {
    const { pool, factory } = setup()
    const input = { ...source, base }
    const lease = pool.acquire(input, options)
    expect(pool.matches(lease, { ...input }, options)).toBe(true)
    expect(pool.matches(lease, { ...input, projectRoot: `${base}-other` }, options)).toBe(false)
    pool.acquire({ ...input, projectRoot: `${base}-other` }, options)
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('来源、准备、样式与回调语义不同不能复用，候选变化可以复用', () => {
    const { pool, factory } = setup()
    const first = pool.acquire(source, options)
    expect(pool.matches(first, source, { ...options, candidates: ['changed'] })).toBe(true)
    const callback = (value: string) => () => value
    const variants = [
      { ...options, target: 'web' },
      { ...options, bareArbitraryValues: true },
      { ...options, scanSources: [] },
      { ...options, styleOptions: { cssPreflight: false } },
      { ...options, styleOptions: { names: new Set(['a']) } },
      { ...options, styleOptions: { names: new Set(['b']) } },
      { ...options, styleOptions: { callback: callback('a') } },
      { ...options, styleOptions: { callback: callback('b') } },
    ] as WeappTailwindcssGenerateOptions[]
    for (const variant of variants) {
      expect(pool.matches(first, source, variant)).toBe(false)
      pool.acquire(source, variant)
    }
    pool.acquire({ ...source, baseFallbacks: [process.cwd()] }, options)
    expect(factory).toHaveBeenCalledTimes(variants.length + 2)
  })

  it('失败后清除增量游标，跨租约仅返回完整副本，同租约连续成功可返回增量', async () => {
    const { pool, factory } = setup()
    const left = pool.acquire(source, options)
    const right = pool.acquire(source, options)
    const engine = factory.mock.results[0]!.value
    const output = result(['a'])
    engine.generate.mockResolvedValue(output)
    const first = await left.generate(options)
    expect(first.incrementalCss).toBeUndefined()
    first.classSet.add('changed')
    first.dependencies.push('changed')
    ;(first.customPropertyValues as Map<string, string>).set('--color', 'blue')
    expect(output.classSet).toEqual(new Set(['a']))
    expect(output.dependencies).toEqual(['config.ts'])
    expect(output.customPropertyValues?.get('--color')).toBe('red')
    expect((await left.generate(options)).incrementalCss).toBe('delta')
    expect((await right.generate(options)).incrementalCss).toBeUndefined()
    engine.generate.mockRejectedValueOnce(new Error('generation failed'))
    await expect(right.generate(options)).rejects.toThrow('generation failed')
    expect((await right.generate(options)).incrementalCss).toBeUndefined()
    const brokenValues = new Map<string, string>()
    vi.spyOn(brokenValues, Symbol.iterator).mockImplementation(() => {
      throw new Error('copy failed')
    })
    engine.generate.mockResolvedValueOnce({ ...output, customPropertyValues: brokenValues })
    await expect(right.generate(options)).rejects.toThrow('copy failed')
    expect((await right.generate(options)).incrementalCss).toBeUndefined()
  })

  it('兼容未返回 sources 的生成器并复制解析来源中的规则', async () => {
    const { pool, factory } = setup()
    const input = { ...source, sources: [{ base: process.cwd(), pattern: '*.vue' }] }
    const lease = pool.acquire(input, options)
    factory.mock.results[0]!.value.generate.mockResolvedValueOnce({ ...result(), sources: undefined } as any)
    const output = await lease.generate(options)
    expect(output.sources).toEqual(input.sources)
    expect(output.sources).not.toBe(input.sources)
    output.sources[0]!.pattern = '*.changed'
    expect(input.sources[0]!.pattern).toBe('*.vue')
  })

  it('退役服务的已接收任务可排空，不更新新服务身份或增量游标', async () => {
    const { pool, factory } = setup()
    const old = pool.acquire(source, options)
    const gate = deferred()
    factory.mock.results[0]!.value.generate.mockImplementationOnce(async () => {
      await gate.promise
      return result(['old'])
    })
    const pending = old.generate(options)
    await Promise.resolve()
    pool.invalidate(old)
    expect(pool.matches(old, source, options)).toBe(false)
    const replacement = pool.acquire(source, options)
    const fresh = await replacement.generate({ ...options, candidates: ['new'] })
    gate.resolve()
    expect((await pending).incrementalCss).toBeUndefined()
    expect(fresh.classSet).toEqual(new Set(['new']))
    expect(pool.matches(replacement, source, options)).toBe(true)
    pool.invalidate(old)
    expect(pool.matches(replacement, source, options)).toBe(true)
    await old.dispose!()
    expect(factory.mock.results[1]!.value.dispose).not.toHaveBeenCalled()
  })

  it('关闭拒绝新任务、排空在途任务并聚合清理失败，重复关闭返回同一结果', async () => {
    const { pool, factory } = setup()
    const first = pool.acquire(source, options)
    const second = pool.acquire({ ...source, css: 'different' }, options)
    const gate = deferred()
    factory.mock.results[0]!.value.generate.mockImplementationOnce(async () => {
      await gate.promise
      return result()
    })
    factory.mock.results[0]!.value.dispose.mockRejectedValueOnce(new Error('release failed'))
    const pending = first.generate(options)
    const close = pool.dispose()
    const checked = expect(close).rejects.toThrow('生成服务释放失败')
    expect(pool.dispose()).toBe(close)
    expect(() => pool.acquire(source, options)).toThrow('已关闭')
    expect(() => second.generate(options)).toThrow('已关闭')
    gate.resolve()
    await pending
    await checked
    expect(factory.mock.results.map(item => item.value.dispose.mock.calls.length)).toEqual([1, 1])
    pools.splice(pools.indexOf(pool), 1)
  })
})
