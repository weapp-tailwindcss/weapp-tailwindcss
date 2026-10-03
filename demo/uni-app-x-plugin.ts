import type { PluginOption } from 'vite'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

type Environment = Record<string, string | undefined>
type PathApi = Pick<typeof path, 'isAbsolute' | 'join'>

/** 使用 IDE 提供的插件身份，兼容独立安装的编译器；缺失时禁止混入项目版本。 */
export function resolveHBuilderXCompilerRoot(env: Environment, pathApi: PathApi = path) {
  let compilerRoot: unknown
  if (env.HX_PLUGIN_PATHS) {
    const pluginPaths: unknown = JSON.parse(env.HX_PLUGIN_PATHS)
    if (!pluginPaths || typeof pluginPaths !== 'object' || Array.isArray(pluginPaths)) {
      throw new Error('HBuilderX 的 HX_PLUGIN_PATHS 必须是插件路径映射')
    }
    compilerRoot = (pluginPaths as Record<string, unknown>)['uniapp-cli-vite']
  }
  else if (env.UNI_HBUILDERX_PLUGINS) {
    compilerRoot = pathApi.join(env.UNI_HBUILDERX_PLUGINS, 'uniapp-cli-vite')
  }
  else if (env.HX_APP_ROOT) {
    compilerRoot = pathApi.join(env.HX_APP_ROOT, 'plugins', 'uniapp-cli-vite')
  }
  else {
    return undefined
  }
  if (typeof compilerRoot !== 'string' || !pathApi.isAbsolute(compilerRoot)) {
    throw new Error('HBuilderX 未提供 uniapp-cli-vite 的绝对路径，不能回退到项目插件')
  }
  return compilerRoot
}

/** 从调用方配置解析 npm 依赖；IDE 构建仅解析当前 IDE 的同一套编译插件。 */
export function resolveUniPlugin(configUrl: string, env: Environment = process.env) {
  const require = createRequire(configUrl)
  const compilerRoot = resolveHBuilderXCompilerRoot(env)
  const id = compilerRoot
    ? path.join(compilerRoot, 'node_modules', '@dcloudio', 'vite-plugin-uni')
    : '@dcloudio/vite-plugin-uni'
  return { modulePath: require.resolve(id), source: compilerRoot ? 'HBuilderX' : 'npm' }
}

export function loadUniPlugin(configUrl: string, env: Environment = process.env): () => PluginOption {
  const { modulePath, source } = resolveUniPlugin(configUrl, env)
  const loaded: unknown = createRequire(configUrl)(modulePath)
  const plugin = loaded && typeof loaded === 'object' && 'default' in loaded ? loaded.default : loaded
  if (typeof plugin !== 'function') {
    throw new TypeError(`uni 插件未导出工厂函数：${modulePath}`)
  }
  if (source === 'HBuilderX') {
    console.info(`[uni-toolchain] ${source}: ${modulePath}`)
  }
  return plugin as () => PluginOption
}
