import type { Plugin, UserConfig } from 'vite'
import path from 'node:path'
import process from 'node:process'
import { logger } from '@weapp-tailwindcss/logger'
import { removeTailwindPostcssPlugins, resolvePostcssConfig } from '@weapp-tailwindcss/postcss/transform'
import { disableAndRemoveTailwindVitePlugins } from '../official-tailwind-plugins'

interface GenerationConfigOptions {
  shouldOwnTailwindGeneration: boolean
  generatorPlaceholderCssFile: string
  debug: (...args: any[]) => void
}

/** 配置前置处理不创建编译会话。 */
export function createGenerationConfigHook(options: GenerationConfigOptions): NonNullable<Plugin['config']> {
  return {
    config(config: UserConfig) {
      if (!options.shouldOwnTailwindGeneration) {
        return
      }
      if (Array.isArray(config.plugins)) {
        const removed = disableAndRemoveTailwindVitePlugins(config.plugins)
        if (removed > 0) {
          logger.warn('检测到 @tailwindcss/vite，生成模式下已移除该插件以避免 Tailwind CSS 重复生成。')
          options.debug('disable official tailwind vite plugins in generator mode: %d', removed)
        }
      }
      const root = config.root ? path.resolve(config.root) : process.cwd()
      const baseConfig = {
        resolve: {
          alias: [{ find: /^tailwindcss$/, replacement: options.generatorPlaceholderCssFile }],
        },
      }
      if (config.css?.postcss !== undefined && typeof config.css.postcss !== 'string') {
        return baseConfig
      }
      const postcssRoot = typeof config.css?.postcss === 'string' ? path.resolve(root, config.css.postcss) : root
      return resolvePostcssConfig(postcssRoot).then((postcssConfig) => {
        if (!postcssConfig) {
          return baseConfig
        }
        const plugins = [...postcssConfig.plugins]
        const removed = removeTailwindPostcssPlugins(plugins)
        if (removed > 0) {
          options.debug('inline filtered postcss config without official tailwind plugins in generator mode: %d', removed)
        }
        return {
          ...baseConfig,
          css: {
            postcss: {
              ...postcssConfig.options,
              plugins,
            },
          },
        }
      })
    },
  }.config
}
