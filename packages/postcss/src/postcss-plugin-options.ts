import type { AcceptedPlugin } from 'postcss'
import type { Result } from 'postcss-load-config'

interface DefaultPluginModule<T> {
  default: T | DefaultPluginModule<T>
}

type PluginSource = AcceptedPlugin | string
type PluginFactoryOutput = AcceptedPlugin | DefaultPluginModule<AcceptedPlugin>

// 这里只保存不同参数类型的工厂引用；实际调用在 unknown 配置归一化边界处理。
type PluginFactory = (options: never) => PluginFactoryOutput | PromiseLike<PluginFactoryOutput>
type TupleSource = PluginSource | PluginFactory

export type ConfiguredPostcssPlugin
  = | PluginSource
    | DefaultPluginModule<PluginSource>
    | [plugin: TupleSource | DefaultPluginModule<TupleSource>, options?: unknown]
    | false
    | null
    | undefined

/** map 的值是插件引用，键不是 postcss-load-config 的模块请求及选项映射。 */
export type ConfiguredPostcssPlugins = ConfiguredPostcssPlugin[] | Record<string, ConfiguredPostcssPlugin>

export type LoadedPostcssOptions = Partial<Omit<Result, 'file' | 'plugins'>> & {
  plugins?: ConfiguredPostcssPlugins | undefined
}
