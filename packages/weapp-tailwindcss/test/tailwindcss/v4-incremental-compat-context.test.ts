import type { TailwindV4Engine } from '@/tailwindcss/v4-engine'
import { afterEach, describe, expect, it } from 'vitest'
import { clearTailwindV4IncrementalGenerateCacheForTest, createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'

const engines: TailwindV4Engine[] = []

afterEach(() => {
  engines.splice(0).forEach(engine => engine.dispose?.())
  clearTailwindV4IncrementalGenerateCacheForTest()
})

describe('增量主题兼容上下文', () => {
  it.each(['--weight', '--alias'])('局部覆盖 %s 撤销已折叠颜色，删除与重加均等于独立完整生成', async (property) => {
    const source = await resolveTailwindV4Source({
      css: '@theme inline { --color-probe:rgba(255,0,0,.4); } :root{--weight:50%;--alias:var(--weight)} @tailwind utilities;',
      base: process.cwd(),
    })
    const incrementalEngine = createTailwindV4Engine(source)
    const referenceEngine = createTailwindV4Engine(source)
    engines.push(incrementalEngine, referenceEngine)
    const background = 'bg-probe/(--alias)'
    const override = `[${property}:25%]`
    const phases = [[background], [background, override], [background], [background, override]]
    for (const candidates of phases) {
      const options = { target: 'weapp' as const, scanSources: false, candidates, styleOptions: { cssCalc: false } }
      const actual = await incrementalEngine.generate({ ...options, incrementalCache: true })
      const reference = await referenceEngine.generate({ ...options, incrementalCache: false })
      expect(actual.css, candidates.join(' ')).toBe(reference.css)
      expect(actual.classSet).toEqual(reference.classSet)
      if (candidates.includes(override)) {
        expect(actual.css).not.toContain('rgba(255, 0, 0, 0.2)')
      }
      else {
        expect(actual.css).toContain('rgba(255, 0, 0, 0.2)')
      }
    }
  })

  it.each([false, ['--spacing']])('颜色转换不把局部变量推导值升级成 calc 常量，cssCalc=%s', async (cssCalc) => {
    const source = await resolveTailwindV4Source({
      css: `
        @theme { --spacing: 1rpx; --color-white: #fff; }
        .local { --spacing: 2rpx; }
        @tailwind utilities;
      `,
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)
    engines.push(engine)
    const options = { scanSources: false, incrementalCache: true, styleOptions: { cssCalc } }
    await engine.generate({ ...options, candidates: ['w-32'] })
    const candidates = ['w-32', 'p-4', 'text-white/10']
    const result = await engine.generate({ ...options, candidates })

    expect(result.incrementalCss).toBeUndefined()
    expect(result.css).toContain('color: rgba(255, 255, 255, 0.1)')
    expect(result.css).toMatch(/padding:\s*calc\(var\(--spacing\)\s*\*\s*4\)/)
    expect(result.css).toMatch(/width:\s*calc\(var\(--spacing\)\s*\*\s*32\)/)
    expect(result.customPropertyValues?.size ?? 0).toBe(0)

    const cached = await engine.generate({ ...options, candidates })
    expect(cached.css).toBe(result.css)
    expect(cached.incrementalCss).toBe('')
    expect(cached.customPropertyValues?.size ?? 0).toBe(0)

    await engine.generate({ ...options, candidates: ['w-32'] })
    const appended = await engine.generate({ ...options, candidates: ['w-32', 'p-4'] })
    expect(appended.incrementalCss).toMatch(/padding:\s*calc\(var\(--spacing\)\s*\*\s*4\)/)
    expect(appended.customPropertyValues?.size ?? 0).toBe(0)
  })

  it('完整与增量颜色结果一致，保留调用方映射且不污染后续生成', async () => {
    const source = await resolveTailwindV4Source({
      css: '@theme { --color-white: #fff; } @tailwind utilities;',
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)
    engines.push(engine)
    const customPropertyValues = new Map([['--color-white', '#000']])
    const options = { scanSources: false, incrementalCache: true, styleOptions: { customPropertyValues } }
    await engine.generate({ ...options, candidates: ['block'] })
    const result = await engine.generate({ ...options, candidates: ['block', 'text-white/10'] })
    expect(result.incrementalCss).toBeUndefined()
    const full = await engine.generate({ ...options, incrementalCache: false, candidates: ['block', 'text-white/10'] })
    expect(result.css).toBe(full.css)
    expect(result.css).toContain('color: rgba(255, 255, 255, 0.1)')
    expect(result.customPropertyValues).toEqual(customPropertyValues)

    const independent = await engine.generate({
      scanSources: false,
      incrementalCache: true,
      candidates: ['block', 'text-white/10'],
    })
    expect(independent.css).toContain('color: rgba(255, 255, 255, 0.1)')
    expect(independent.customPropertyValues?.size ?? 0).toBe(0)
  })
})
