import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import { afterEach, describe, expect, it } from 'vitest'
import { clearTailwindV4IncrementalGenerateCacheForTest, createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'

const theme = '@theme default { --spacing: 2rem; } @tailwind utilities;'

describe('Web 生成结果的显式单位规则', () => {
  afterEach(clearTailwindV4IncrementalGenerateCacheForTest)

  it('生成器自身转换任意值，不需要消费者额外处理生成结果', async () => {
    const source = await resolveTailwindV4Source({ css: theme, base: process.cwd() })
    const engine = createTailwindV4Engine(source)
    try {
      const result = await engine.generate({
        candidates: ['mt-[8rpx]', 'p-[40rpx]'],
        scanSources: false,
        target: 'web',
        styleOptions: {
          rem2rpx: false,
          cssOptions: { unitConversion: { rules: [{ from: 'rpx', to: 'rem', factor: 1 / 32 }] } },
        },
      })
      expect(result.rawCss).toContain('margin-top: 8rpx')
      expect(result.css).toContain('margin-top: 0.25rem')
      expect(result.css).toContain('padding: 1.25rem')
      expect(result.css).not.toMatch(/:\s*[\d.]+rpx\b/)
    }
    finally {
      await engine.dispose?.()
    }
  })

  it.each([
    { name: '同单位缩放', options: { unitConversion: { rules: [{ from: 'rem', to: 'rem', factor: 2 }] } }, expected: '4rem' },
    { name: '回到原单位的管线', options: { unitsToPx: { unitMap: { rem: 10 } }, unitConversion: { rules: [{ from: 'px', to: 'rem', factor: 0.5 }] } }, expected: '10rem' },
  ])('$name 在完整、增量和命中缓存的生成中只执行一次', async ({ options, expected }) => {
    const source = await resolveTailwindV4Source({ css: theme, base: process.cwd() })
    const engine = createTailwindV4Engine(source)
    const styleOptions = { rem2rpx: false, ...options } as Partial<IStyleHandlerOptions>
    const generate = (candidates: string[]) => engine.generate({ candidates, target: 'web', scanSources: false, incrementalCache: true, styleOptions })
    try {
      const first = await generate(['mt-[2rem]'])
      const expanded = await generate(['mt-[2rem]', 'p-[2rem]'])
      const cached = await generate(['mt-[2rem]', 'p-[2rem]'])
      for (const result of [first, expanded, cached]) {
        expect(result.rawCss).toContain('margin-top: 2rem')
        expect(result.css).toContain(`margin-top: ${expected}`)
      }
      expect(expanded.css).toContain(`padding: ${expected}`)
      expect(expanded.incrementalCss).toContain(`padding: ${expected}`)
      expect(cached.css).toBe(expanded.css)
    }
    finally {
      await engine.dispose?.()
    }
  })

  it('先按原始主题计算，再执行嵌套配置的单位规则', async () => {
    const source = await resolveTailwindV4Source({ css: theme, base: process.cwd() })
    const engine = createTailwindV4Engine(source)
    try {
      const result = await engine.generate({
        candidates: ['p-2'],
        scanSources: false,
        target: 'web',
        styleOptions: {
          rem2rpx: true,
          cssOptions: {
            rem2rpx: false,
            cssCalc: ['--spacing'],
            unitConversion: { rules: [{ from: 'rem', to: 'rem', factor: 2 }] },
          },
        },
      })
      expect(result.css).toContain('padding: 8rem')
      expect(result.css).not.toContain('rpx')
    }
    finally {
      await engine.dispose?.()
    }
  })
})
