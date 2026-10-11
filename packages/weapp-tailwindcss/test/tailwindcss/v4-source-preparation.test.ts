import type { TailwindV4Engine, TailwindV4GenerateOptions } from '@/tailwindcss/v4-engine'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearTailwindV4IncrementalGenerateCacheForTest, createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'
import * as macroSource from '@/tailwindcss/v4-engine/css-macro-source'
import * as cssCompat from '@/tailwindcss/v4-engine/generator/css-compat'
import { TailwindV4NativeSessionPool } from '@/tailwindcss/v4-engine/generator/native-session'

const engines: TailwindV4Engine[] = []
const theme = `
  @theme { --spacing: 1rpx; }
  @custom-variant wx {
    /* #ifdef MP-WEIXIN */
    @slot;
    /* #endif */
  }
  @tailwind utilities;
`

afterEach(() => {
  engines.splice(0).forEach(engine => engine.dispose())
  clearTailwindV4IncrementalGenerateCacheForTest()
  vi.restoreAllMocks()
})

async function createEngines() {
  const source = await resolveTailwindV4Source({ css: theme, base: process.cwd() })
  const engine = createTailwindV4Engine(source)
  const reference = createTailwindV4Engine(source)
  engines.push(engine, reference)
  return { engine, reference, source }
}

function artifact(result: Awaited<ReturnType<TailwindV4Engine['generate']>>) {
  return {
    css: result.css,
    rawCss: result.rawCss,
    classSet: result.classSet,
    rawCandidates: result.rawCandidates,
    dependencies: result.dependencies,
    sources: result.sources,
    root: result.root,
    target: result.target,
    customPropertyContextCss: result.customPropertyContextCss,
  }
}

const routes: Array<{ name: string, options: TailwindV4GenerateOptions }> = [
  { name: '增量缓存未启用', options: { incrementalCache: false } },
  { name: '裸任意值未定义', options: {} },
  { name: '裸任意值关闭', options: { bareArbitraryValues: false } },
  { name: '裸任意值开启', options: { bareArbitraryValues: true } },
  { name: '裸任意值指定单位', options: { bareArbitraryValues: { units: ['px'] } } },
  { name: '多份内存来源', options: { sources: [{ content: 'italic', extension: 'html' }, { content: 'underline', extension: 'html' }] } },
  { name: '空扫描数组', options: { scanSources: [] } },
  { name: '显式开启扫描', options: { scanSources: true } },
  { name: '编译扫描', options: { scanMode: 'compiled' } },
]

describe.each(['web', 'weapp'] as const)('请求内来源准备：%s', (target) => {
  it.each(routes)('$name 仅准备一次并保留完整产物', async ({ options }) => {
    const { engine, reference } = await createEngines()
    const request = {
      target,
      scanSources: false,
      incrementalCache: true,
      candidates: ['block', 'wx:p-4'],
      styleOptions: { cssCalc: ['--spacing'] },
      ...options,
    }
    const expected = await reference.generate({ ...request, incrementalCache: false })
    const macro = vi.spyOn(macroSource, 'resolveCssMacroTailwindV4Source')
    const compat = vi.spyOn(cssCompat, 'createCompatibleSource')
    const result = await engine.generate(request)

    expect(artifact(result)).toEqual(artifact(expected))
    expect(result.classSet).toContain('wx:p-4')
    expect(result.css).toContain('#ifdef MP-WEIXIN')
    expect(macro).toHaveBeenCalledTimes(1)
    expect(compat).toHaveBeenCalledTimes(1)
    expect(compat).toHaveBeenCalledWith(macro.mock.results[0]!.value, target)
  })

  it('初建、命中、追加校验和删除重建共享各自请求的准备结果', async () => {
    const { engine, reference } = await createEngines()
    const macro = vi.spyOn(macroSource, 'resolveCssMacroTailwindV4Source')
    const compat = vi.spyOn(cssCompat, 'createCompatibleSource')
    const generate = vi.spyOn(TailwindV4NativeSessionPool.prototype, 'generate')
    const request = { target, scanSources: false, incrementalCache: true }
    const counts: Array<{ macro: number, compat: number, generation: number }> = []

    for (const candidates of [['block'], ['block'], ['block', 'underline'], ['underline'], []]) {
      const expected = await reference.generate({ ...request, candidates, incrementalCache: false })
      vi.clearAllMocks()
      const result = await engine.generate({ ...request, candidates })
      expect(result.classSet).toEqual(expected.classSet)
      expect(result.dependencies).toEqual(expected.dependencies)
      expect(result.root).toEqual(expected.root)
      for (const candidate of ['block', 'underline']) {
        expect(result.css.includes(`.${candidate}`)).toBe(candidates.includes(candidate))
      }
      counts.push({ macro: macro.mock.calls.length, compat: compat.mock.calls.length, generation: generate.mock.calls.length })
    }

    expect(counts).toEqual([
      { macro: 1, compat: 1, generation: 1 },
      { macro: 1, compat: 1, generation: 0 },
      { macro: 1, compat: 1, generation: 1 },
      { macro: 1, compat: 1, generation: 1 },
      { macro: 1, compat: 1, generation: 1 },
    ])
  })

  it('同一引擎的源码和配置变化在下一次请求重新准备', async () => {
    const { engine, source } = await createEngines()
    const request = { target, scanSources: false, incrementalCache: true, bareArbitraryValues: false, candidates: ['w-4'] }
    const macro = vi.spyOn(macroSource, 'resolveCssMacroTailwindV4Source')
    const compat = vi.spyOn(cssCompat, 'createCompatibleSource')
    const first = await engine.generate({ ...request, styleOptions: { cssCalc: ['--spacing'] } })
    expect(first.css).toMatch(/width:\s*4rpx/)

    source.css = theme.replace('1rpx', '2rpx')
    const changed = await engine.generate({ ...request, styleOptions: { cssCalc: ['--spacing'] } })
    expect(changed.css).toMatch(/width:\s*8rpx/)
    const runtime = await engine.generate({ ...request, styleOptions: { cssCalc: false } })
    expect(runtime.css).toMatch(/width:\s*calc\(var\(--spacing\)\s*\*\s*4\)/)
    expect(macro).toHaveBeenCalledTimes(3)
    expect(compat).toHaveBeenCalledTimes(3)
  })
})
