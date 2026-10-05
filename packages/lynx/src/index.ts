import type { RsbuildPlugin } from '@lynx-js/rspeedy'
import type { WeappTailwindcssGeneratorOptions } from 'weapp-tailwindcss/generator'
import type { PatchRspackConfigOptions, RspackConfigLike } from 'weapp-tailwindcss/rspack'
import type { UserDefinedOptions } from 'weapp-tailwindcss/types'
import type { LynxTemplatePluginApi } from './css-variables'
import { patchRspackConfig, WeappTailwindcss } from 'weapp-tailwindcss/rspack'
import { LynxCssVariablesPlugin } from './css-variables'

const PLUGIN_NAME = 'weapp-tailwindcss:lynx'

interface LynxGeneratorOptions extends Omit<WeappTailwindcssGeneratorOptions, 'target'> {}

/** ReactLynx Rspeedy 适配配置。 */
export interface LynxTailwindcssOptions extends Omit<UserDefinedOptions, 'platform' | 'generator'> {
  /** 透传给 Rspack CSS 规则补丁的配置。 */
  rspack?: PatchRspackConfigOptions | undefined
  /** Tailwind CSS v4 生成配置，目标固定为 Lynx 可消费的 web CSS。 */
  generator?: LynxGeneratorOptions | false | undefined
}

interface RspackPluginChain {
  use: <T>(plugin: new (options: T) => unknown, options: [T]) => unknown
}

interface BundlerChain {
  plugin: (name: string) => RspackPluginChain
}

interface RsbuildPluginApi {
  useExposed: (key: symbol) => { LynxTemplatePlugin?: LynxTemplatePluginApi } | undefined
  modifyBundlerChain: (handler: (chain: BundlerChain) => BundlerChain) => void
  modifyRspackConfig: (handler: (config: RspackConfigLike) => RspackConfigLike) => void
}

function normalizeOptions(options: LynxTailwindcssOptions): UserDefinedOptions {
  const { rspack: _rspack, generator, ...rest } = options
  const generatorOptions = generator === false ? {} : generator
  return {
    ...rest,
    rewriteCssImports: true,
    platform: 'lynx',
    cssOptions: {
      ...options.cssOptions,
      platform: 'lynx',
    },
    generator: {
      ...generatorOptions,
      webCompat: true,
      styleOptions: {
        ...generatorOptions?.styleOptions,
        cssOptions: {
          ...generatorOptions?.styleOptions?.cssOptions,
          platform: 'lynx',
        },
      },
      target: 'web',
    },
  }
}

function normalizeRspackOptions(options: PatchRspackConfigOptions | undefined): PatchRspackConfigOptions {
  const cssImportRewriteLoader = options?.cssImportRewriteLoader
  if (cssImportRewriteLoader === false) {
    return options ?? {}
  }
  const loaderOptions = cssImportRewriteLoader === true || cssImportRewriteLoader === undefined
    ? {}
    : cssImportRewriteLoader
  return {
    ...options,
    cssImportRewriteLoader: {
      ...loaderOptions,
      options: {
        ...loaderOptions.options,
        generateCss: true,
      },
    },
  }
}

/**
 * 为 ReactLynx + Rspeedy 注册 Tailwind CSS v4 构建链路。
 *
 * Lynx 原生支持 CSS class selector，因此不会改写 JSX `className` 或创建运行时样式表。
 */
export function pluginLynxTailwindcss(options: LynxTailwindcssOptions = {}): RsbuildPlugin {
  const normalizedOptions = normalizeOptions(options)

  return {
    name: PLUGIN_NAME,
    setup(api) {
      const rsbuildApi = api as unknown as RsbuildPluginApi
      rsbuildApi.modifyBundlerChain((chain) => {
        // 所有插件 setup 完成后复用实际构建器暴露的模板入口，避免独立副本与 ESM/CJS 边界。
        const templatePlugin = rsbuildApi.useExposed?.(Symbol.for('LynxTemplatePlugin'))?.LynxTemplatePlugin
        if (!templatePlugin?.getLynxTemplatePluginHooks) {
          throw new Error('Lynx 模板编码 hook 不可用；请注册或升级 ReactLynx 构建插件（至少 0.12.4），确认其提供 LynxTemplatePlugin API。')
        }
        chain.plugin(PLUGIN_NAME).use(WeappTailwindcss, [normalizedOptions])
        chain.plugin(`${PLUGIN_NAME}:css-variables`).use(LynxCssVariablesPlugin, [templatePlugin])
        return chain
      })
      rsbuildApi.modifyRspackConfig(config => patchRspackConfig(config, normalizeRspackOptions(options.rspack)))
    },
  }
}

export { PLUGIN_NAME }
