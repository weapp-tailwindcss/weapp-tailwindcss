import type { ResolvedConfig } from 'vite'

/** 框架声明来源与阶段策略，生命周期与共享状态由 Vite 适配器持有。 */
export interface ViteFrameworkRuntimeStrategy {
  allowWebProductionFastPath?: boolean
  defaultToWebTarget?: boolean
  invalidateBeforeTransform?: boolean
  isRuntimeAffectingSource?: (file: string, isWeb: boolean) => boolean
  isTemplateHotSource?: (id: string) => boolean
  isTemplateHotSourceModule?: (id: string) => boolean
  requiresCssHotReload?: (config: ResolvedConfig | undefined) => boolean
  splitGenerateBundlePhases?: (config: ResolvedConfig | undefined) => boolean
}
