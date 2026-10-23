import type { FrameworkPolicyInput } from './types'
import type { FrameworkPolicy } from '@/compiler/framework-policy'
import { shouldUseUniAppViteWebViewGeneratorTarget } from './environment'

export function applyUniAppPolicy(policy: FrameworkPolicy, input: FrameworkPolicyInput): FrameworkPolicy {
  return {
    ...policy,
    defaultGeneratorTarget: shouldUseUniAppViteWebViewGeneratorTarget(input.appType, input.platform)
      ? 'web'
      : policy.defaultGeneratorTarget,
    disableWebRemToRpx: input.appType === 'uni-app-vite' || policy.disableWebRemToRpx,
  }
}
