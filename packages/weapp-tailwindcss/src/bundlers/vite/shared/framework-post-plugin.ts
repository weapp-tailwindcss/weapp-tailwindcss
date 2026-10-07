import type { Plugin } from 'vite'
import path from 'node:path'
import process from 'node:process'
import { logger } from '@weapp-tailwindcss/logger'
import { removeTailwindPostcssPlugins, resolvePostcssConfig } from '@weapp-tailwindcss/postcss/transform'
import { vitePluginName } from '@/constants'
import { captureFrameworkPostcssOptions } from '../../../generation/framework-postcss'
import { disableAndRemoveTailwindVitePlugins, removeTailwindVitePlugins } from '../official-tailwind-plugins'
import { resolveImplicitAppTypeFromViteRoot } from '../resolve-app-type'
import { resolveImplicitTailwindcssBasedirFromViteRoot } from '../tailwind-basedir'
import { installFrameworkCssEmission } from './framework-css-emission'

export function createFrameworkPostPlugin(options: any): Plugin {
  const plugin: Plugin & { api?: unknown } = {
    name: `${vitePluginName}:post`,
    enforce: 'post',
    config(config) {
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
      if (config.css?.postcss !== undefined) {
        return baseConfig
      }
      return resolvePostcssConfig(root).then((postcssConfig) => {
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
    async configResolved(config) {
      await options.hmrTimingRecorder.measure('configResolved', async () => {
        options.setResolvedConfig(config)
        if (options.shouldOwnTailwindGeneration) {
          const removed = Array.isArray(config.plugins) ? removeTailwindVitePlugins(config.plugins) : 0
          if (removed > 0) {
            options.debug('remove official tailwind vite plugins in generator mode: %d', removed)
          }
        }
        const resolvedRoot = config.root ? path.resolve(config.root) : undefined
        let shouldRefreshRuntime = false
        if (!options.hasExplicitTailwindcssBasedir && resolvedRoot) {
          const nextTailwindcssBasedir = resolveImplicitTailwindcssBasedirFromViteRoot(resolvedRoot)
          if (options.opts.tailwindcssBasedir !== nextTailwindcssBasedir) {
            const previousBasedir = options.opts.tailwindcssBasedir
            options.opts.tailwindcssBasedir = nextTailwindcssBasedir
            shouldRefreshRuntime = options.syncCssEntriesFromAnchor(nextTailwindcssBasedir) || shouldRefreshRuntime
            options.debug('align tailwindcss basedir with vite root: %s -> %s', previousBasedir ?? 'undefined', nextTailwindcssBasedir)
            shouldRefreshRuntime = true
          }
        }
        if (options.shouldInferAppType && resolvedRoot) {
          const nextAppType = resolveImplicitAppTypeFromViteRoot(resolvedRoot, { searchUp: false })
          if (nextAppType && options.opts.appType !== nextAppType) {
            const previousAppType = options.opts.appType
            options.opts.appType = nextAppType
            logger.debug('根据 Vite 项目根目录自动推断 appType -> %s', nextAppType)
            options.debug('align appType with vite root: %s -> %s', previousAppType ?? 'undefined', nextAppType)
            shouldRefreshRuntime = true
          }
        }
        if (
          options.frameworkName === 'generic'
          && !options.hasExplicitGeneratorTarget
          && options.opts.generator !== false
          && options.opts.appType === undefined
          && options.opts.platform === undefined
          && options.opts.cssOptions?.platform === undefined
          && !options.resolveViteStylePlatform()
        ) {
          const generator = options.opts.generator && typeof options.opts.generator === 'object'
            ? options.opts.generator
            : {}
          options.opts.generator = { ...generator, target: 'web' }
          logger.debug('Generic Vite 项目未指定目标，自动使用 generator.target -> web')
          options.debug('default generic vite generator target to web after configResolved')
          shouldRefreshRuntime = true
        }
        if (shouldRefreshRuntime) {
          await options.refreshRuntimeState(true)
        }
        if (typeof config.css.postcss === 'object' && Array.isArray(config.css.postcss.plugins)) {
          const postcssPlugins = config.css.postcss.plugins
          if (options.shouldOwnTailwindGeneration) {
            const removed = removeTailwindPostcssPlugins(postcssPlugins)
            if (removed > 0) {
              logger.warn('检测到 @tailwindcss/postcss，生成模式下已移除该插件以避免 Tailwind CSS 重复生成。')
              options.debug('remove official tailwind postcss plugins in generator mode: %d', removed)
            }
          }
        }
        captureFrameworkPostcssOptions(
          options.opts,
          config.css?.postcss && typeof config.css.postcss === 'object'
            ? config.css.postcss
            : undefined,
        )
        if (options.transformEmittedWebCss) {
          installFrameworkCssEmission(config, options.transformEmittedWebCss, options.shouldRehashEmittedWebCssAsset)
        }
      }, { emit: false })
    },
    buildStart() {
      const config = options.getResolvedConfig?.()
      if (config && options.transformEmittedWebCss) {
        installFrameworkCssEmission(config, options.transformEmittedWebCss, options.shouldRehashEmittedWebCssAsset)
      }
    },
  }
  if (typeof options.generateBundleHook === 'function') {
    plugin.generateBundle = {
      order: 'post',
      handler: options.generateBundleHook,
    }
  }
  if (options.api) {
    plugin.api = options.api
  }
  return plugin
}
