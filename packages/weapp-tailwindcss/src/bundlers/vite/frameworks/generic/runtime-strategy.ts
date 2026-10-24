import type { ViteFrameworkRuntimeStrategy } from '../../shared/framework-runtime-strategy'

/** 通用 Web 构建只在分支装配时启用生产 CSS 快速路径。 */
export const genericViteRuntimeStrategy: ViteFrameworkRuntimeStrategy = {
  allowWebProductionFastPath: true,
  defaultToWebTarget: true,
}
