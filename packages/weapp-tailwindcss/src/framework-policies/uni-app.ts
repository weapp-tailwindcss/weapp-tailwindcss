import type { FrameworkEnvironment } from './environment-snapshot'
import type { FrameworkPolicyInput } from './types'
import type { FrameworkPolicy } from '@/compiler/framework-policy'
import { shouldUseUniAppViteWebViewGeneratorTarget } from './environment'

export function applyUniAppPolicy(policy: FrameworkPolicy, input: FrameworkPolicyInput, environment: FrameworkEnvironment): FrameworkPolicy {
  return {
    ...policy,
    defaultGeneratorTarget: shouldUseUniAppViteWebViewGeneratorTarget(input.appType, input.platform ?? environment.uniPlatform ?? '')
      ? 'web'
      : policy.defaultGeneratorTarget,
    disableWebRemToRpx: input.appType === 'uni-app-vite' || policy.disableWebRemToRpx,
  }
}
