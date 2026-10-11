import { PLUGIN_NAME, pluginLynxTailwindcss } from '../src/index'

function createApi() {
  let bundlerHandler: ((chain: any) => any) | undefined
  let rspackHandler: ((config: any) => any) | undefined
  return {
    api: {
      useExposed: vi.fn(() => ({ LynxTemplatePlugin: { getLynxTemplatePluginHooks: vi.fn() } })),
      modifyBundlerChain(handler: (chain: any) => any) {
        bundlerHandler = handler
      },
      modifyRspackConfig(handler: (config: any) => any) {
        rspackHandler = handler
      },
    },
    getBundlerHandler: () => bundlerHandler,
    getRspackHandler: () => rspackHandler,
  }
}

describe('pluginLynxTailwindcss', () => {
  it('registers the core Rspack plugin with a fixed Lynx web CSS target', () => {
    const { api, getBundlerHandler, getRspackHandler } = createApi()
    const plugin = pluginLynxTailwindcss({
      generator: { target: 'weapp', webCompat: false } as any,
    })

    expect(plugin.name).toBe(PLUGIN_NAME)
    plugin.setup(api as never)

    const use = vi.fn()
    getBundlerHandler()?.({ plugin: vi.fn(() => ({ use })) })
    expect(use).toHaveBeenCalledTimes(2)
    const [, [options]] = use.mock.calls[0]!
    expect(options).toMatchObject({
      platform: 'lynx',
      cssOptions: { platform: 'lynx' },
      generator: {
        target: 'web',
        webCompat: true,
        styleOptions: { cssOptions: { platform: 'lynx' } },
      },
    })
    expect(getRspackHandler()).toBeTypeOf('function')
  })

  it('在所有 setup 后消费宿主暴露的模板 hook，保留每轮编码的显式配置和其他元数据', () => {
    const { api, getBundlerHandler } = createApi()
    pluginLynxTailwindcss().setup(api as never)
    expect(api.useExposed).not.toHaveBeenCalled()
    const compilationTap = vi.fn()
    const encodeTap = vi.fn()
    const templatePlugin = { getLynxTemplatePluginHooks: vi.fn(() => ({ beforeEncode: { tap: encodeTap } })) }
    api.useExposed.mockReturnValue({ LynxTemplatePlugin: templatePlugin })
    const use = vi.fn()
    getBundlerHandler()?.({ plugin: () => ({ use }) })
    expect(api.useExposed).toHaveBeenCalledWith(Symbol.for('LynxTemplatePlugin'))
    const [Plugin, [host]] = use.mock.calls[1]!
    new Plugin(host).apply({ hooks: { thisCompilation: { tap: compilationTap } } })
    for (const explicit of [undefined, false, true]) {
      const compilation = {}
      compilationTap.mock.calls[0]![1](compilation)
      expect(templatePlugin.getLynxTemplatePluginHooks).toHaveBeenLastCalledWith(compilation)
      const sourceContent = { dsl: 'react_nodiff', config: { enableCSSInlineVariables: explicit, preserve: 'metadata' } }
      const args = { encodeData: { sourceContent, css: { dynamic: 'var(--value)' } }, filename: 'chunk.lynx.bundle' }
      const result = encodeTap.mock.calls.at(-1)![1](args)
      expect(result).toBe(args)
      expect(result.encodeData.sourceContent.config).toEqual({
        enableCSSInlineVariables: explicit ?? true,
        preserve: 'metadata',
      })
      expect(result.encodeData.css.dynamic).toBe('var(--value)')
      expect(result.filename).toBe('chunk.lynx.bundle')
    }
  })

  it('缺少宿主模板 API 时明确失败，不静默回退旧变量解析', () => {
    const { api, getBundlerHandler } = createApi()
    pluginLynxTailwindcss().setup(api as never)
    api.useExposed.mockReturnValue(undefined as never)
    const plugin = vi.fn()
    expect(() => getBundlerHandler()?.({ plugin })).toThrow('Lynx 模板编码 hook 不可用')
    expect(plugin).not.toHaveBeenCalled()
  })

  it('enables CSS generation by default when patching Rspack rules', () => {
    const { api, getRspackHandler } = createApi()
    pluginLynxTailwindcss().setup(api as never)
    const config = {
      module: {
        rules: [{
          use: [
            { loader: 'css-loader' },
            { loader: 'builtin:lightningcss-loader' },
          ],
        }],
      },
    }

    getRspackHandler()?.(config)

    const use = (config as any).module.rules[0].use
    expect(use.map((item: any) => item.loader)).toEqual([
      'css-loader',
      'builtin:lightningcss-loader',
      expect.stringMatching(/weapp-tw-css-import-rewrite-loader\.cjs$/),
    ])
    expect(use[2].options).toEqual({ generateCss: true })
  })

  it('preserves custom CSS loader settings while enabling generation', () => {
    const { api, getRspackHandler } = createApi()
    pluginLynxTailwindcss({
      rspack: {
        cssImportRewriteLoader: {
          loader: '/custom/css-loader.cjs',
          options: {
            tailwindcssImportRewriteRuntimeKey: 'lynx-runtime',
          },
        },
      },
    }).setup(api as never)
    const config = {
      module: {
        rules: [{
          use: [{ loader: 'builtin:lightningcss-loader' }],
        }],
      },
    }

    getRspackHandler()?.(config)

    expect((config as any).module.rules[0].use).toEqual([
      { loader: 'builtin:lightningcss-loader' },
      {
        loader: '/custom/css-loader.cjs',
        options: {
          tailwindcssImportRewriteRuntimeKey: 'lynx-runtime',
          generateCss: true,
        },
      },
    ])
  })

  it('does not patch CSS rules when the loader is explicitly disabled', () => {
    const { api, getRspackHandler } = createApi()
    pluginLynxTailwindcss({
      rspack: { cssImportRewriteLoader: false },
    }).setup(api as never)
    const config = {
      module: {
        rules: [{
          use: [{ loader: 'builtin:lightningcss-loader' }],
        }],
      },
    }

    getRspackHandler()?.(config)

    expect((config as any).module.rules[0].use).toEqual([
      { loader: 'builtin:lightningcss-loader' },
    ])
  })

  it('keeps repeated Rspack patches idempotent', () => {
    const { api, getRspackHandler } = createApi()
    pluginLynxTailwindcss().setup(api as never)
    const config = {
      module: {
        rules: [{
          use: [
            { loader: 'css-loader' },
            { loader: 'builtin:lightningcss-loader' },
          ],
        }],
      },
    }

    getRspackHandler()?.(config)
    getRspackHandler()?.(config)

    expect((config as any).module.rules[0].use).toHaveLength(3)
    expect((config as any).module.rules[0].use[2].options).toEqual({ generateCss: true })
  })
})
