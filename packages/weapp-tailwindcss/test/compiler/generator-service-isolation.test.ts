import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FrameworkCompilerSession } from '@/compiler/framework-compiler-session'
import { clearTailwindV4IncrementalGenerateCacheForTest, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'
import { TailwindV4NativeSessionPool } from '@/tailwindcss/v4-engine/generator/native-session'

const owners: FrameworkCompilerSession[] = []
const request = { scanSources: false, target: 'weapp' as const }
function source() {
  return resolveTailwindV4Source({
    base: process.cwd(),
    css: '@theme { --spacing: 1rpx; } @tailwind utilities;',
  })
}
function owner() {
  const session = new FrameworkCompilerSession({} as any)
  owners.push(session)
  return session
}
function nativePools(spy: ReturnType<typeof vi.spyOn>) {
  return [...new Set(spy.mock.contexts)] as TailwindV4NativeSessionPool[]
}

afterEach(async () => {
  await Promise.all(owners.splice(0).map(session => session.dispose()))
  clearTailwindV4IncrementalGenerateCacheForTest()
  vi.restoreAllMocks()
})

describe('编译 owner 内的生成服务', () => {
  it('四个同源 scope 复用一个原生会话，交错并发候选增删仍分别提交', async () => {
    const session = owner()
    const input = await source()
    const generated = vi.spyOn(TailwindV4NativeSessionPool.prototype, 'generate')
    const first = []
    for (let index = 0; index < 4; index++) {
      first.push(await session.generate(`scope-${index}`, 'source.css', input, { ...request, candidates: ['block'] }))
    }
    expect(nativePools(generated)).toHaveLength(1)
    expect(new Set(first.map(result => result.snapshot.roots[0]?.id)).size).toBe(4)
    const candidates = [['p-4'], ['m-2', 'italic'], ['underline'], []]
    const changed = await Promise.all(candidates.map((candidates, index) => session.generate(`scope-${index}`, 'source.css', input, { ...request, candidates })))
    changed.forEach((result, index) => {
      expect([...result.classSet].sort()).toEqual([...candidates[index]!].sort())
      expect(result.css).not.toContain('.block')
      expect(result.revision).toBe(2)
    })
    expect(nativePools(generated)).toHaveLength(1)
    await session.removeScope('scope-0')
    expect(nativePools(generated)[0]?.size).toBe(1)
    const remaining = await session.generate('scope-2', 'source.css', input, { ...request, candidates: ['underline', 'p-4'] })
    expect([...remaining.classSet].sort()).toEqual(['p-4', 'underline'])
    await session.dispose()
    expect(nativePools(generated)[0]?.size).toBe(0)
  })

  it('相同配置的两个 owner 保持独立，关闭其中一个不使另一个重建', async () => {
    const left = owner()
    const right = owner()
    const input = await source()
    const generated = vi.spyOn(TailwindV4NativeSessionPool.prototype, 'generate')
    for (const session of [left, right]) {
      await session.generate('scope-a', 'source.css', input, { ...request, candidates: ['block'] })
      await session.generate('scope-b', 'source.css', input, { ...request, candidates: ['block'] })
    }
    expect(nativePools(generated)).toHaveLength(2)
    await left.dispose()
    expect(nativePools(generated).map(pool => pool.size).sort()).toEqual([0, 1])
    const result = await right.generate('scope-a', 'source.css', input, { ...request, candidates: ['italic'] })
    expect([...result.classSet]).toEqual(['italic'])
    expect(nativePools(generated)).toHaveLength(2)
  })

  it('跨 root 不透传相对其他 root 的增量，同 root 连续更新仍保留增量', async () => {
    const session = owner()
    const input = await source()
    const styleOptions = { isMainChunk: false }
    await session.generate('left', 'source.css', input, { ...request, styleOptions, candidates: ['text-[18rpx]'] })
    await session.generate('right', 'source.css', input, { ...request, styleOptions, candidates: ['text-[18rpx]'] })
    const changedLeft = await session.generate('left', 'source.css', input, { ...request, styleOptions, candidates: ['text-[18rpx]', 'text-[28rpx]'] })
    expect(changedLeft.incrementalCss).toBeUndefined()
    const changedRight = await session.generate('right', 'source.css', input, { ...request, styleOptions, candidates: ['text-[18rpx]', 'text-[28rpx]', 'text-[32rpx]'] })
    expect(changedRight.incrementalCss).toBeUndefined()
    expect(changedRight.css).toContain('font-size: 28rpx')
    const consecutive = await session.generate('right', 'source.css', input, { ...request, styleOptions, candidates: ['text-[18rpx]', 'text-[28rpx]', 'text-[32rpx]', 'text-[40rpx]'] })
    expect(consecutive.incrementalCss).toBeTypeOf('string')
    expect(consecutive.incrementalCss).toContain('font-size: 40rpx')
  })

  it('root 输出缓存命中不移动共享服务游标，后续增量和删除仍相对正确', async () => {
    const session = owner()
    const input = await source()
    const styleOptions = { isMainChunk: false }
    const generate = (scope: string, candidates: string[]) => session.generate(scope, 'source.css', input, { ...request, styleOptions, candidates })
    const generated = vi.spyOn(TailwindV4NativeSessionPool.prototype, 'generate')
    const left = await generate('left', ['text-[18rpx]'])
    await generate('right', ['text-[18rpx]', 'text-[28rpx]'])
    const calls = generated.mock.calls.length
    const cached = await generate('left', ['text-[18rpx]'])
    expect(cached.cache.output).toBe(true)
    expect(cached.css).toBe(left.css)
    expect(cached.css).not.toContain('font-size: 28rpx')
    expect(cached.incrementalCss).toBe('')
    expect(generated).toHaveBeenCalledTimes(calls)

    const right = await generate('right', ['text-[18rpx]', 'text-[28rpx]', 'text-[32rpx]'])
    expect(right.incrementalCss).toContain('font-size: 32rpx')
    expect(right.incrementalCss).not.toContain('font-size: 18rpx')
    expect(right.incrementalCss).not.toContain('font-size: 28rpx')
    const changedLeft = await generate('left', ['text-[18rpx]', 'text-[40rpx]'])
    expect(changedLeft.incrementalCss).toBeUndefined()
    expect(changedLeft.css).toContain('font-size: 18rpx')
    expect(changedLeft.css).toContain('font-size: 40rpx')
    expect(changedLeft.css).not.toContain('font-size: 28rpx')
    expect(changedLeft.css).not.toContain('font-size: 32rpx')
    const removed = await generate('left', ['text-[40rpx]'])
    expect(removed.css).not.toContain('font-size: 18rpx')
    expect(removed.css).toContain('font-size: 40rpx')
    expect(nativePools(generated)).toHaveLength(1)
  })

  it('同 root 来源及样式选项变化替换租约，旧服务在最后引用释放后关闭', async () => {
    const session = owner()
    const input = await source()
    const generated = vi.spyOn(TailwindV4NativeSessionPool.prototype, 'generate')
    await session.generate('scope', 'source.css', input, { ...request, candidates: ['p-4'] })
    const changed = await session.generate('scope', 'source.css', { ...input, css: input.css.replace('1rpx', '2rpx') }, { ...request, candidates: ['p-4'] })
    expect(changed.rawCss).toContain('--spacing: 2rpx')
    await session.generate('scope', 'source.css', input, { ...request, candidates: ['p-4'], styleOptions: { cssCalc: false } })
    await session.dispose()
    expect(nativePools(generated).every(pool => pool.size === 0)).toBe(true)
  })

  it('不同 scope 的 preflight、局部样式和单位转换与独立 owner 的产物一致', async () => {
    const session = owner()
    const input = await resolveTailwindV4Source({ base: process.cwd(), css: '@import "tailwindcss";' })
    const configurations = [
      { ...request, candidates: ['p-4'], styleOptions: { isMainChunk: true, cssPreflight: { 'box-sizing': 'border-box' }, cssCalc: ['--spacing'] } },
      { ...request, candidates: ['p-4'], styleOptions: { isMainChunk: false, cssPreflight: false as const, cssCalc: false as const } },
    ]
    const references = await Promise.all(configurations.map(configuration => owner().generate('reference', 'source.css', input, configuration)))
    const outputs = await Promise.all(configurations.map((configuration, index) => session.generate(`scope-${index}`, 'source.css', input, configuration)))
    outputs.forEach((output, index) => {
      expect(output.css).toBe(references[index]!.css)
      expect(output.rawCss).toBe(references[index]!.rawCss)
    })
    expect(outputs[0]!.css).not.toBe(outputs[1]!.css)
    const switched = await session.generate('scope-0', 'source.css', input, configurations[1]!)
    expect(switched.css).toBe(references[1]!.css)
    expect(switched.incrementalCss).toBeUndefined()
    const stable = await session.generate('scope-1', 'source.css', input, configurations[1]!)
    expect(stable.css).toBe(references[1]!.css)
  })

  it('共同依赖失效后两根转入同一新服务，重复失效不保留旧服务', async () => {
    const session = owner()
    const dependency = path.resolve(process.cwd(), 'virtual-theme.config.ts')
    const input = { ...await source(), dependencies: [dependency] }
    const generated = vi.spyOn(TailwindV4NativeSessionPool.prototype, 'generate')
    for (const scope of ['left', 'right']) {
      await session.generate(scope, 'source.css', input, { ...request, candidates: ['block'] })
    }
    expect(nativePools(generated)).toHaveLength(1)
    for (let round = 1; round <= 3; round++) {
      expect(session.invalidate([dependency])).toHaveLength(2)
      await session.generate('left', 'source.css', input, { ...request, candidates: ['block', 'italic'] })
      await session.generate('right', 'source.css', input, { ...request, candidates: ['underline'] })
      await Promise.resolve()
      expect(nativePools(generated)).toHaveLength(round + 1)
      expect(nativePools(generated).reduce((total, pool) => total + pool.size, 0)).toBe(1)
    }
    await session.dispose()
    expect(nativePools(generated).every(pool => pool.size === 0)).toBe(true)
  })
})
