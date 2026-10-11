import { normalizeMiniProgramGeneratedCssForPostcss } from '@weapp-tailwindcss/postcss/transform'
import { afterEach, describe, expect, it } from 'vitest'
import { mergeGeneratorResultsForOutput } from '@/generation/pipeline/style-context'
import { clearTailwindV4IncrementalGenerateCacheForTest, createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'

const engines: ReturnType<typeof createTailwindV4Engine>[] = []
const styleOptions = { cssCalc: ['--spacing'], rem2rpx: false }

async function createEngine(spacing: string, extra = '') {
  const source = await resolveTailwindV4Source({
    css: `@theme { --spacing: ${spacing}; } @tailwind utilities; ${extra}`,
    base: process.cwd(),
  })
  const engine = createTailwindV4Engine(source)
  engines.push(engine)
  return engine
}

afterEach(() => {
  engines.splice(0).forEach(engine => engine.dispose?.())
  clearTailwindV4IncrementalGenerateCacheForTest()
})

describe('calc context across source and incremental boundaries', () => {
  it.each(['.compact { --spacing: 2rpx }', '@media (min-width: 1px) { :root { --spacing: 2rpx } }'])('preserves runtime overrides: %s', async (extra) => {
    const engine = await createEngine('1rpx', extra)
    const result = await engine.generate({ candidates: ['w-32'], target: 'weapp', scanSources: false, styleOptions })
    expect(result.css).toMatch(/width:\s*calc\(var\(--spacing\)\s*\*\s*32\)/)
    expect(result.css).not.toMatch(/width:\s*64rpx/)
  })

  it('invalidates already folded rules when a new candidate introduces a local variable override', async () => {
    const engine = await createEngine('1rpx')
    const options = { target: 'weapp' as const, scanSources: false, incrementalCache: true, styleOptions }
    const first = await engine.generate({ ...options, candidates: ['w-32'] })
    expect(first.css).toMatch(/width:\s*32rpx/)
    const second = await engine.generate({ ...options, candidates: ['w-32', '[--spacing:2rpx]'] })
    expect(second.css).toMatch(/width:\s*calc\(var\(--spacing\)\s*\*\s*32\)/)
    expect(second.incrementalCss).toBeUndefined()
    const third = await engine.generate({ ...options, candidates: ['w-32'] })
    expect(third.css).toMatch(/width:\s*32rpx/)
    expect(third.css).not.toContain('--spacing: 2rpx')
  })

  it('keeps conflicting shared-output contexts consistent across eager and deferred output', async () => {
    const a = await createEngine('1rpx')
    const b = await createEngine('2rpx')
    const results = await Promise.all([
      a.generate({ candidates: ['w-32'], target: 'weapp', scanSources: false, styleOptions }),
      b.generate({ candidates: ['p-4'], target: 'weapp', scanSources: false, styleOptions }),
    ])
    const merged = (await mergeGeneratorResultsForOutput(results, styleOptions))!
    const deferred = await normalizeMiniProgramGeneratedCssForPostcss(merged.rawCss, {
      ...styleOptions,
      contextCss: merged.rawCss,
      preserveRawClassRules: true,
      preservePreflight: true,
    })
    for (const css of [merged.css, deferred]) {
      expect(css).toMatch(/width:\s*calc\(var\(--spacing\)\s*\*\s*32\)/)
      expect(css).toMatch(/padding:\s*calc\(var\(--spacing\)\s*\*\s*4\)/)
    }
    // 不共享输出的来源仍可独立预计算。
    expect(results[0]!.css).toMatch(/width:\s*32rpx/)
    expect(results[1]!.css).toMatch(/padding:\s*8rpx/)
  })
})
