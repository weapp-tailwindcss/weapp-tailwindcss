import { afterEach, describe, expect, it } from 'vitest'
import { clearTailwindV4IncrementalGenerateCacheForTest, createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'
import { hasChangedCssCalcContext } from '@/tailwindcss/v4-engine/generator/style-context'

const engines: ReturnType<typeof createTailwindV4Engine>[] = []

afterEach(() => {
  engines.splice(0).forEach(engine => engine.dispose?.())
  clearTailwindV4IncrementalGenerateCacheForTest()
})

describe('生成器 calc 转义身份', () => {
  it.each([String.raw`--\73pacing`, String.raw`--s\70 acing`, String.raw`--\spacing`])('按白名单 %s 的同一身份判断动态覆盖失效', (name) => {
    const previous = ':root { --spacing: 1rpx }'
    const next = `${previous} .compact { --spacing: 2rpx }`
    expect(hasChangedCssCalcContext(previous, next, { cssCalc: [name] })).toBe(true)
    expect(hasChangedCssCalcContext(next, previous, { cssCalc: [name] })).toBe(true)
    expect(hasChangedCssCalcContext(previous, String.raw`:root { --\73pacing: 1rpx }`, { cssCalc: [name] })).toBe(false)
  })

  it('转义白名单在真实候选增删时重算旧工具类', async () => {
    const source = await resolveTailwindV4Source({ css: '@theme { --spacing: 1rpx } @tailwind utilities;', base: process.cwd() })
    const engine = createTailwindV4Engine(source)
    engines.push(engine)
    const options = {
      target: 'weapp' as const,
      scanSources: false,
      incrementalCache: true,
      styleOptions: { cssCalc: [String.raw`--\73pacing`], rem2rpx: false },
    }
    expect((await engine.generate({ ...options, candidates: ['w-32'] })).css).toMatch(/width:\s*32rpx/)
    const changed = await engine.generate({ ...options, candidates: ['w-32', '[--spacing:2rpx]'] })
    expect(changed.css).toMatch(/width:\s*calc\(var\(--spacing\)\s*\*\s*32\)/)
    expect(changed.incrementalCss).toBeUndefined()
    const cached = await engine.generate({ ...options, candidates: ['w-32', '[--spacing:2rpx]'] })
    expect(cached.css).toBe(changed.css)
    expect(cached.incrementalCss).toBe('')
    const restored = await engine.generate({ ...options, candidates: ['w-32'] })
    expect(restored.css).toMatch(/width:\s*32rpx/)
    expect(restored.css).not.toContain('--spacing: 2rpx')
  })
})
