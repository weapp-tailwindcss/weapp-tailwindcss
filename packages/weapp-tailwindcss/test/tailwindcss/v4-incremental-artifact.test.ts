import type { TailwindV4Engine } from '@/tailwindcss/v4-engine'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearTailwindV4IncrementalGenerateCacheForTest, createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'
import { TailwindV4NativeSessionPool } from '@/tailwindcss/v4-engine/generator/native-session'
import * as targetTransform from '@/tailwindcss/v4-engine/miniprogram'

const engines: TailwindV4Engine[] = []
afterEach(() => {
  engines.splice(0).forEach(engine => engine.dispose?.())
  clearTailwindV4IncrementalGenerateCacheForTest()
  vi.restoreAllMocks()
})

async function engineFor(css: string) {
  const source = await resolveTailwindV4Source({ css, base: process.cwd() })
  const engine = createTailwindV4Engine(source)
  engines.push(engine)
  return { engine, source }
}

const theme = '@theme { --spacing: 1rpx; } @tailwind utilities;'

describe.each(['web', 'weapp'] as const)('完整增量编译产物：%s', (target) => {
  const options = { target, scanSources: false, incrementalCache: true, styleOptions: { cssCalc: ['--spacing'] } }

  it.each([{ initial: [] }, { initial: ['block'] }, { initial: ['w-32'] }])('初始 $initial 经清空后重加保留主题声明', async ({ initial }) => {
    const { engine } = await engineFor(theme)
    await engine.generate({ ...options, candidates: initial })
    await engine.generate({ ...options, candidates: [] })
    const generated = await engine.generate({ ...options, candidates: ['w-32'] })
    expect(generated.css).toMatch(/width:\s*32rpx/)
    expect(generated.rawCss).toMatch(/--spacing:\s*1rpx/)
  })

  it('新增 utility 排在已有规则前时保持完整编译器的层叠顺序', async () => {
    const { engine } = await engineFor(theme)
    await engine.generate({ ...options, candidates: ['w-32'] })
    const candidates = ['w-32', 'w-8']
    const generated = await engine.generate({ ...options, candidates })
    const full = await engine.generate({ ...options, incrementalCache: false, candidates })
    expect(generated.rawCss).toBe(full.rawCss)
    expect(generated.css).toBe(full.css)
    expect(generated.css.indexOf('.w-8')).toBeLessThan(generated.css.indexOf('.w-32'))
    expect(generated.incrementalCss).toBeUndefined()
  })

  it('无候选时修改主题，重加后使用当前主题', async () => {
    const { engine, source } = await engineFor(theme)
    await engine.generate({ ...options, candidates: ['w-32'] })
    await engine.generate({ ...options, candidates: [] })
    source.css = theme.replace('1rpx', '2rpx')
    await engine.generate({ ...options, candidates: [] })
    const generated = await engine.generate({ ...options, candidates: ['w-32'] })
    expect(generated.css).toMatch(/width:\s*64rpx/)
    expect(generated.rawCss).toMatch(/--spacing:\s*2rpx/)
  })

  it('第一次使用 animation 保留 keyframes 与主题载体', async () => {
    const { engine } = await engineFor(`
      @theme {
        --animate-spin: spin 1s linear infinite;
        @keyframes spin { to { transform: rotate(360deg); } }
      }
      @tailwind utilities;
    `)
    await engine.generate({ ...options, candidates: ['block'] })
    const generated = await engine.generate({ ...options, candidates: ['block', 'animate-spin'] })
    expect(generated.rawCss).toContain('@keyframes spin')
    expect(generated.rawCss).toContain('--animate-spin: spin 1s linear infinite')
    expect(generated.incrementalCss).toBeUndefined()
  })

  it('第一次使用边框保留 property 注册和初始化依赖', async () => {
    const { engine } = await engineFor(theme)
    await engine.generate({ ...options, candidates: ['block'] })
    const generated = await engine.generate({ ...options, candidates: ['block', 'border'] })
    expect(generated.rawCss).toContain('@property --tw-border-style')
    expect(generated.incrementalCss).toBeUndefined()
  })

  it('未变候选零生成；纯 utility 追加仅转换新增规则', async () => {
    const { engine } = await engineFor(theme)
    const generate = vi.spyOn(TailwindV4NativeSessionPool.prototype, 'generate')
    const transform = vi.spyOn(targetTransform, 'transformTailwindV4CssByTarget')
    const initial = { ...options, candidates: ['w-32', 'not-a-tailwind-class'] }
    await engine.generate(initial)
    generate.mockClear()
    transform.mockClear()

    for (let index = 0; index < 3; index++) {
      const cached = await engine.generate(initial)
      expect(cached.incrementalCss).toBe('')
    }
    expect(generate).not.toHaveBeenCalled()
    expect(transform).not.toHaveBeenCalled()

    const result = await engine.generate({ ...options, candidates: [...initial.candidates, 'p-4'] })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(transform).toHaveBeenCalledTimes(1)
    expect(transform.mock.calls[0]?.[0]).toContain('.p-4')
    expect(transform.mock.calls[0]?.[0]).not.toContain('.w-32')
    expect(result.incrementalCss).toMatch(/padding:\s*4rpx/)
    expect(result.incrementalCss).not.toContain('.w-32')
    expect(result.css).toMatch(/width:\s*32rpx/)
  })

  it('依赖发生变化时只生成一次完整产物并重新转换一次', async () => {
    const { engine } = await engineFor(theme)
    await engine.generate({ ...options, candidates: ['block'] })
    const generate = vi.spyOn(TailwindV4NativeSessionPool.prototype, 'generate')
    const transform = vi.spyOn(targetTransform, 'transformTailwindV4CssByTarget')
    const generated = await engine.generate({ ...options, candidates: ['block', 'w-32'] })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(transform).toHaveBeenCalledTimes(1)
    expect(transform.mock.calls[0]?.[0]).toContain('.block')
    expect(transform.mock.calls[0]?.[0]).toContain('--spacing: 1rpx')
    expect(generated.css).toMatch(/width:\s*32rpx/)
    expect(generated.incrementalCss).toBeUndefined()
  })
})
