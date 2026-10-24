import type { RuntimeBranch, RuntimeBranchContext, RuntimeBranchGeneratorOptions } from './types'
import type { FrameworkPolicy } from '@/compiler/framework-policy'
import { resolveFrameworkPolicy } from '@/framework-policies/resolve'
import { createMiniProgramRuntimeBranch } from './mini-program'
import { createNativeAppRuntimeBranch } from './native-app'
import { normalizeRuntimeUniUtsPlatform } from './platform'
import { resolveTailwindcssBranchVersion } from './tailwind-version'
import { createWebRuntimeBranch } from './web'

export function resolveRuntimeBranch(context: RuntimeBranchContext, policy: FrameworkPolicy = resolveFrameworkPolicy(context)): RuntimeBranch {
  const uniUtsPlatform = normalizeRuntimeUniUtsPlatform(context.uniUtsPlatform)
  const base = {
    context,
    tailwindcssVersion: resolveTailwindcssBranchVersion(context.tailwindcssMajorVersion),
    uniUtsPlatform,
  }

  if (context.generatorTarget === 'web') {
    return createWebRuntimeBranch(base)
  }
  if (policy.useNativeApp) {
    return createNativeAppRuntimeBranch(base)
  }
  return createMiniProgramRuntimeBranch(base)
}

export function resolveGeneratorRuntimeBranch(
  options: RuntimeBranchGeneratorOptions,
  context: Omit<RuntimeBranchContext, 'generatorTarget'> = {},
): RuntimeBranch {
  return options.branch ?? resolveRuntimeBranch({
    ...context,
    generatorTarget: options.target,
  })
}

export function shouldUseMiniProgramCssBranch(branch: RuntimeBranch) {
  return branch.platformFamily === 'mini-program' || branch.platformFamily === 'native-app'
}

export function shouldUseNativeAppCssBranch(branch: RuntimeBranch) {
  return branch.platformFamily === 'native-app'
}

export type {
  NativeAppPlatform,
  RuntimeBranch,
  RuntimeBranchContext,
  RuntimeBranchGeneratorOptions,
  RuntimePlatformFamily,
  TailwindcssBranchVersion,
} from './types'
