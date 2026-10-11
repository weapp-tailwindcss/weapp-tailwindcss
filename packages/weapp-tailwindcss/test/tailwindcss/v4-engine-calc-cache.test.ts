import type { TailwindV4Engine } from '@/tailwindcss/v4-engine'
import { afterEach, describe, expect, it } from 'vitest'
import { clearTailwindV4IncrementalGenerateCacheForTest, createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'

describe('cssCalc incremental configuration identity', () => {
  const engines: TailwindV4Engine[] = []

  afterEach(() => {
    for (const engine of engines.splice(0)) {
      engine.dispose?.()
    }
    clearTailwindV4IncrementalGenerateCacheForTest()
  })

  async function createEngine() {
    const source = await resolveTailwindV4Source({
      css: '@theme { --spacing: 1rpx; } @tailwind utilities;',
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)
    engines.push(engine)
    return engine
  }

  const options = {
    candidates: ['w-32'],
    scanSources: false,
    target: 'weapp' as const,
    incrementalCache: true,
  }

  it('invalidates changed mapped values while reusing equivalent maps regardless of insertion order', async () => {
    const engine = await createEngine()
    const generate = (entries: [string, string][]) => engine.generate({
      ...options,
      styleOptions: { cssCalc: ['--spacing'], customPropertyValues: new Map(entries) },
    })

    const first = await generate([['--spacing', '1rpx'], ['--unused', '3rpx']])
    const equivalent = await generate([['--unused', '3rpx'], ['--spacing', '1rpx']])
    expect(first.css).toMatch(/width:\s*32rpx/)
    expect(equivalent.css).toBe(first.css)
    expect(equivalent.incrementalCss).toBe('')

    const changed = await generate([['--unused', '3rpx'], ['--spacing', '2rpx']])
    expect(changed.css).toMatch(/width:\s*64rpx/)
    expect(changed.css).not.toMatch(/width:\s*32rpx/)
    expect(changed.customPropertyValues?.get('--spacing')).toBe('2rpx')
    expect(changed.incrementalCss).toBeUndefined()
  })

  it.each(['web', 'weapp'] as const)('invalidates regex source and flags on %s but ignores mutable lastIndex', async (target) => {
    const engine = await createEngine()
    const generate = (pattern: RegExp) => engine.generate({ ...options, target, styleOptions: { cssCalc: [pattern] } })

    const first = await generate(/^--spacing$/g)
    const equivalentPattern = /^--spacing$/g
    equivalentPattern.lastIndex = 8
    const equivalent = await generate(equivalentPattern)
    expect(first.css).toMatch(/width:\s*32rpx/)
    expect(equivalent.css).toBe(first.css)
    expect(equivalent.incrementalCss).toBe('')

    const unmatched = await generate(/^--SPACING$/)
    expect(unmatched.css).toMatch(/width:\s*calc\(var\(--spacing\)\s*\*\s*32\)/)
    expect(unmatched.incrementalCss).toBeUndefined()

    const caseInsensitive = await generate(/^--SPACING$/i)
    expect(caseInsensitive.css).toMatch(/width:\s*32rpx/)
    expect(caseInsensitive.incrementalCss).toBeUndefined()
  })
})
