/** 框架判断所需的配置事实；不暴露 Vite 插件对象或配置所有权。 */
export interface ViteFrameworkRuntimeFacts {
  readonly mode: string
  readonly pluginNames: readonly string[]
}

/** 框架声明来源与阶段策略，生命周期与共享状态由 Vite 适配器持有。 */
export interface ViteFrameworkRuntimeStrategy {
  allowWebProductionFastPath?: boolean
  defaultToWebTarget?: boolean
  invalidateBeforeTransform?: boolean
  isRuntimeAffectingSource?: (file: string, isWeb: boolean) => boolean
  isTemplateHotSource?: (id: string) => boolean
  isTemplateHotSourceModule?: (id: string) => boolean
  requiresCssHotReload?: (facts: ViteFrameworkRuntimeFacts | undefined) => boolean
  splitGenerateBundlePhases?: (facts: ViteFrameworkRuntimeFacts | undefined) => boolean
}
