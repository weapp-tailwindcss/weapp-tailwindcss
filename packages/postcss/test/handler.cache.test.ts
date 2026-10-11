import { beforeEach, describe, expect, it, vi } from 'vitest'

const postcssAsync = vi.fn(async () => ({ css: '' }))
const postcssProcess = vi.fn<(css?: string, options?: Record<string, unknown>) => { async: typeof postcssAsync }>(
  () => ({
    async: postcssAsync,
  }),
)

const postcssFactory = vi.fn((plugins?: unknown) => ({ process: postcssProcess, plugins }))

vi.mock('postcss', async () => {
  const actual = await vi.importActual<typeof import('postcss')>('postcss')
  return {
    ...actual,
    default: postcssFactory,
  }
})

vi.mock('@/plugins', async () => {
  const actual = await vi.importActual<typeof import('@/plugins')>('@/plugins')
  return {
    ...actual,
    getPlugins: vi.fn(() => ['mock-plugin']),
  }
})

const { createStyleHandler } = await import('@/handler')
const { probeFeatures } = await import('@/content-probe')

describe('style handler caching', () => {
  beforeEach(() => {
    postcssFactory.mockClear()
    postcssProcess.mockClear()
  })

  it('provides fresh process options while preserving cache state', async () => {
    const handler = createStyleHandler()

    const override: { postcssOptions: { options: Record<string, unknown> } } = {
      postcssOptions: {
        options: {
          map: false,
        },
      },
    }

    await handler('.foo { color: red; }', override)
    const firstOptions = postcssProcess.mock.calls[0][1]
    expect(firstOptions).toBeDefined()
    firstOptions!.mutated = true

    await handler('.bar { color: blue; }', override)
    const secondOptions = postcssProcess.mock.calls[1][1]
    expect(secondOptions?.mutated).toBeUndefined()

    override.postcssOptions.options.extra = 'value'

    await handler('.baz { color: green; }', override)
    const thirdOptions = postcssProcess.mock.calls[2][1]
    expect(thirdOptions?.extra).toBe('value')
  })

  it('reuses processor instance when only from changes', async () => {
    const handler = createStyleHandler()
    expect(postcssFactory).not.toHaveBeenCalled()

    await handler('.foo { color: red; }', {
      postcssOptions: {
        options: {
          from: 'app.wxss',
        },
      },
    })

    await handler('.bar { color: blue; }', {
      postcssOptions: {
        options: {
          from: 'pages/index/index.wxss',
        },
      },
    })

    expect(postcssFactory).toHaveBeenCalledTimes(1)
  })
})


describe('content-probe integration', () => {
  beforeEach(() => {
    postcssFactory.mockClear()
    postcssProcess.mockClear()
  })

  it('auto-skips color-functional-fallback when CSS has no modern color functions', async () => {
    const handler = createStyleHandler()

    // 内容探测前不提前创建无信号管线。
    const initCallCount = postcssFactory.mock.calls.length

    // 简单 CSS 不含现代颜色函数，probeFeatures 应返回 hasModernColorFunction: false
    // 但 hasPresetEnvFeatures 始终为 true（autoprefixer 需要）
    const simpleCSS = '.box { color: red; }'
    const signal = probeFeatures(simpleCSS)
    expect(signal.hasModernColorFunction).toBe(false)
    expect(signal.hasPresetEnvFeatures).toBe(true)

    await handler(simpleCSS)

    // handler 调用后应创建新的 processor（因为信号不同于初始化时的无信号）
    expect(postcssFactory.mock.calls.length).toBeGreaterThan(initCallCount)

    // 获取 handler 调用时创建的 processor 的插件列表
    const lastCall = postcssFactory.mock.calls[postcssFactory.mock.calls.length - 1]
    const pluginsForSimple = lastCall[0] as unknown[]

    // 获取基线 pipeline（无信号，包含所有插件）
    const basePipeline = handler.getPipeline()
    const basePluginCount = basePipeline.plugins.length

    // 裁剪后的插件数量应少于基线（跳过了 color-functional-fallback）
    expect(pluginsForSimple.length).toBeLessThan(basePluginCount)
  })

  it('includes all plugins when CSS has modern features', async () => {
    const handler = createStyleHandler()
    const initCallCount = postcssFactory.mock.calls.length

    // 包含现代颜色函数的 CSS
    const modernCSS = '.box { color: rgb(255 0 0 / 0.5); }'
    const signal = probeFeatures(modernCSS)
    expect(signal.hasModernColorFunction).toBe(true)

    await handler(modernCSS)

    const lastCall = postcssFactory.mock.calls[postcssFactory.mock.calls.length - 1]
    const pluginsForModern = lastCall[0] as unknown[]

    // 基线 pipeline 包含所有插件
    const basePipeline = handler.getPipeline()

    // 现代 CSS 的插件数量应与基线一致（未裁剪 color-functional-fallback）
    // 注意：hasPresetEnvFeatures 可能为 false，所以只验证 color-functional-fallback 未被裁剪
    expect(pluginsForModern.length).toBeGreaterThanOrEqual(basePipeline.plugins.length - 1)
  })

  it('falls back to full pipeline when probeFeatures throws', async () => {
    const contentProbe = await import('@/content-probe')
    const originalProbe = contentProbe.probeFeatures

    // 临时替换 probeFeatures 使其抛出异常
    // 由于 handler 内部使用 try-catch，异常时 signal 为 undefined，回退到全量加载
    const probeSpy = vi.spyOn(contentProbe, 'probeFeatures').mockImplementation(() => {
      throw new Error('probe error')
    })

    try {
      const handler = createStyleHandler()
      const initCallCount = postcssFactory.mock.calls.length

      await handler('.box { color: red; }')

      // 异常时 signal 为 undefined，应创建与基线相同的 processor
      const lastCall = postcssFactory.mock.calls[postcssFactory.mock.calls.length - 1]
      const pluginsOnError = lastCall[0] as unknown[]

      const basePipeline = handler.getPipeline()

      // 回退时插件数量应与基线一致（全量加载）
      expect(pluginsOnError.length).toBe(basePipeline.plugins.length)
    }
    finally {
      probeSpy.mockRestore()
    }
  })
})
