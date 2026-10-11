import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { TailwindV4Engine } from '@/tailwindcss/v4-engine'
import { afterEach, describe, expect, it } from 'vitest'
import { clearTailwindV4IncrementalGenerateCacheForTest, createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'

const engines: TailwindV4Engine[] = []
const candidates = ['sample']
const dynamicCandidates = ['sample', '[--scale:2rpx]']

async function createEngine(fallback = false) {
  const source = await resolveTailwindV4Source({
    css: `@tailwind utilities; @utility sample { width: calc(var(--scale${fallback ? ', 9rpx' : ''}) * 10); }`,
    base: process.cwd(),
  })
  const engine = createTailwindV4Engine(source)
  engines.push(engine)
  return engine
}

function styleOptions(nested: boolean, values: Map<string, string>): Partial<IStyleHandlerOptions> {
  const cssCalc = { includeCustomProperties: ['--scale'], customPropertyValues: values }
  return nested ? { cssOptions: { cssCalc } } : { cssCalc }
}

afterEach(() => {
  engines.splice(0).forEach(engine => engine.dispose?.())
  clearTailwindV4IncrementalGenerateCacheForTest()
})

describe.each([false, true])('calc 对象内显式 Map，cssOptions 嵌套=%s', (nested) => {
  it.each([false, true])('新增局部变量后重算旧声明，空增量保留动态语义，fallback=%s', async (fallback) => {
    const engine = await createEngine(fallback)
    const options = { target: 'weapp' as const, scanSources: false, incrementalCache: true, styleOptions: styleOptions(nested, new Map([['--scale', '1rpx']])) }
    const first = await engine.generate({ ...options, candidates })
    expect(first.css).toMatch(/width:\s*10rpx/)
    const cached = await engine.generate({ ...options, candidates })
    expect(cached.incrementalCss).toBe('')
    expect(cached.css).toBe(first.css)

    const changed = await engine.generate({ ...options, candidates: dynamicCandidates })
    expect(changed.css).toMatch(/width:\s*calc\(var\(--scale(?:,\s*9rpx)?\)\s*\*\s*10\)/)
    expect(changed.css).not.toMatch(/width:\s*(?:10|20|90)rpx/)
    expect(changed.incrementalCss).toBeUndefined()
    const unchanged = await engine.generate({ ...options, candidates: dynamicCandidates })
    expect(unchanged.incrementalCss).toBe('')
    expect(unchanged.css).toBe(changed.css)

    const restored = await engine.generate({ ...options, candidates })
    expect(restored.css).toMatch(/width:\s*10rpx/)
    expect(restored.css).not.toContain('--scale: 2rpx')
  })

  it('同一 Map 修改或删除后，空候选增量不能复用旧显式值或 fallback', async () => {
    const engine = await createEngine(true)
    const values = new Map([['--scale', '1rpx']])
    const options = { target: 'weapp' as const, scanSources: false, incrementalCache: true, styleOptions: styleOptions(nested, values), candidates }
    expect((await engine.generate(options)).css).toMatch(/width:\s*10rpx/)
    values.set('--scale', '2rpx')
    const changed = await engine.generate(options)
    expect(changed.css).toMatch(/width:\s*20rpx/)
    expect(changed.incrementalCss).toBeUndefined()
    values.delete('--scale')
    const unknown = await engine.generate(options)
    expect(unknown.css).toMatch(/width:\s*calc\(var\(--scale,\s*9rpx\)\s*\*\s*10\)/)
    expect(unknown.css).not.toMatch(/width:\s*(?:10|20|90)rpx/)
    expect(unknown.incrementalCss).toBeUndefined()
    const cachedUnknown = await engine.generate(options)
    expect(cachedUnknown.incrementalCss).toBe('')
    expect(cachedUnknown.css).toBe(unknown.css)
  })
})
