import { resolveFrameworkEnvironment } from '@/framework-policies/environment-snapshot'

/** 兼容入口将实例环境事实转换为 Vite 的显式运行时选项。 */
export function resolveContextViteRuntimeRefresh(context: object): boolean {
  return resolveFrameworkEnvironment(context).forceViteRuntimeRefresh
}
