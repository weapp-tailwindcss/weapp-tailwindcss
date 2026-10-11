import type { AcceptedPlugin, Root } from 'postcss'
import type { LoadedPostcssOptions } from './types'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import postcss from 'postcss'
import { removeTailwindPostcssPlugins } from './postcss-config'

function unwrapDefault(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'default' in value) {
    return unwrapDefault(value.default)
  }
  return value
}

async function normalizePlugin(value: unknown, from: string): Promise<AcceptedPlugin | undefined> {
  if (value === false || value === null || value === undefined) {
    return undefined
  }
  const tuple = Array.isArray(value)
  const pluginOptions: unknown = tuple ? value[1] : undefined
  if (pluginOptions === false) {
    return undefined
  }
  let plugin = unwrapDefault(tuple ? value[0] : value)
  if (typeof plugin === 'string') {
    const require = createRequire(pathToFileURL(resolve(from)))
    plugin = unwrapDefault(await import(pathToFileURL(require.resolve(plugin)).href))
  }
  if (tuple && typeof plugin === 'function') {
    plugin = unwrapDefault(await plugin(pluginOptions === true ? undefined : pluginOptions))
  }
  // 普通函数可能是旧版 transformer，实例化和合法性检查继续由 PostCSS 负责。
  return plugin as AcceptedPlugin
}

async function normalizePlugins(configured: unknown, from: string, filterGeneration: boolean): Promise<AcceptedPlugin[]> {
  const entries = Array.isArray(configured) ? configured : Object.values(configured ?? {})
  const plugins: AcceptedPlugin[] = []
  for (const entry of entries) {
    const plugin = await normalizePlugin(entry, from)
    if (plugin !== undefined) {
      plugins.push(plugin)
    }
  }
  if (filterGeneration) {
    removeTailwindPostcssPlugins(plugins)
  }
  return plugins
}

/** 重放框架提供的管线，不附加小程序转换或默认插件。 */
export async function processFrameworkCss(css: string | Root, options: LoadedPostcssOptions) {
  return processConfiguredCss(css, options, true)
}

/** 通用作者阶段保持传入插件契约，生成插件的过滤只属于框架重放边界。 */
export async function processUserCss(css: string | Root, options: LoadedPostcssOptions) {
  return processConfiguredCss(css, options, false)
}

async function processConfiguredCss(css: string | Root, options: LoadedPostcssOptions, filterGeneration: boolean) {
  const plugins = await normalizePlugins(options.plugins, options.options?.from ?? resolve('postcss.config.js'), filterGeneration)
  return postcss(plugins).process(css, {
    from: undefined,
    ...options.options,
  })
}
