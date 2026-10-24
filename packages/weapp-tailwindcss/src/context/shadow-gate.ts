import type { FinalizeCompilerShadowRunOptions } from '@/compiler/shadow-gate'
import { finalizeCompilerShadowRun as finalizeResolvedShadowRun } from '@/compiler/shadow-gate'
import { resolveFrameworkEnvironment } from '@/framework-policies/environment-snapshot'

/** 构建兼容入口将实例环境投影为显式的 shadow 配置。 */
export function finalizeCompilerShadowRun(owner: object, options: FinalizeCompilerShadowRunOptions = {}) {
  const environment = resolveFrameworkEnvironment(owner)
  return finalizeResolvedShadowRun(owner, {
    ...options,
    env: options.env ?? {
      WEAPP_TAILWINDCSS_COMPILER: environment.compilerMode,
      WEAPP_TAILWINDCSS_COMPILER_SHADOW_GATE: environment.shadowGate,
    },
  })
}
