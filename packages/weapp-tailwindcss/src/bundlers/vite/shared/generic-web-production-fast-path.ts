import type { ConfigEnv, ResolvedConfig, UserConfig } from 'vite'

interface GenericWebProductionBuildOptions {
  command: ResolvedConfig['command'] | undefined
  frameworkName: string
  isWebGeneratorTarget: boolean
  requiresSourceCandidateState?: boolean
  watch: ResolvedConfig['build']['watch'] | undefined
}

interface GenericWebProductionFastPathOptions extends GenericWebProductionBuildOptions {
  hasProcessedCss: boolean
}

export interface GenericWebFinalizerFastPathOptions extends GenericWebProductionFastPathOptions {
  hasFrameworkRootImportShells: boolean
  isHarmonyAppStyleTarget: boolean
  isNativeAppStyleTarget: boolean
}

interface GenericWebProductionBundleHooksOptions {
  frameworkName: string
  getHasProcessedCss: () => boolean
  getIsWebGeneratorTarget: () => boolean
  getResolvedConfig: () => ResolvedConfig | undefined
  onEnd: () => void
  onStart: () => void
}

interface GenericWebProductionSourceCandidatesApplyOptions {
  frameworkName: string
  getIsWebGeneratorTarget: () => boolean
  requiresSourceCandidateState: boolean
}

/**
 * Generic Web 非 watch 生产构建由 Tailwind Scanner 直接提供候选，不需要重复维护小程序候选状态。
 */
export function shouldSkipGenericWebProductionSourceCandidates(
  options: GenericWebProductionBuildOptions,
) {
  return options.frameworkName === 'generic'
    && options.command === 'build'
    && options.watch == null
    && options.isWebGeneratorTarget
    && options.requiresSourceCandidateState !== true
}

/**
 * 在 Vite 解析插件列表时排除无需维护的候选层，避免其 hooks 进入模块图。
 */
export function createGenericWebProductionSourceCandidatesApply(
  options: GenericWebProductionSourceCandidatesApplyOptions,
) {
  return (config: UserConfig, env: ConfigEnv) => !shouldSkipGenericWebProductionSourceCandidates({
    command: env.command,
    frameworkName: options.frameworkName,
    isWebGeneratorTarget: options.getIsWebGeneratorTarget(),
    requiresSourceCandidateState: options.requiresSourceCandidateState,
    watch: config.build?.watch,
  })
}

/**
 * Generic Web 生产构建的 CSS 已在 Vite transform 阶段生成时，不需要再建立面向小程序的完整产物快照。
 */
export function shouldUseGenericWebProductionFastPath(
  options: GenericWebProductionFastPathOptions,
) {
  return shouldSkipGenericWebProductionSourceCandidates(options)
    && options.hasProcessedCss
}

/**
 * Finalizer fast path 只处理无小程序结构语义的 Generic Web 生产产物。
 */
export function shouldUseGenericWebFinalizerFastPath(
  options: GenericWebFinalizerFastPathOptions,
) {
  return shouldUseGenericWebProductionFastPath(options)
    && !options.hasFrameworkRootImportShells
    && !options.isHarmonyAppStyleTarget
    && !options.isNativeAppStyleTarget
}

/**
 * 将 Generic Web fast path 的判定和跳过生命周期集中起来，供 generateBundle hook 直接消费。
 */
export function createGenericWebProductionBundleHooks(
  options: GenericWebProductionBundleHooksOptions,
) {
  return {
    onSkipProcessBundle: () => {
      options.onStart()
      options.onEnd()
    },
    shouldProcessBundle: () => {
      const config = options.getResolvedConfig()
      return !shouldUseGenericWebProductionFastPath({
        command: config?.command,
        frameworkName: options.frameworkName,
        hasProcessedCss: options.getHasProcessedCss(),
        isWebGeneratorTarget: options.getIsWebGeneratorTarget(),
        watch: config?.build?.watch,
      })
    },
  }
}
