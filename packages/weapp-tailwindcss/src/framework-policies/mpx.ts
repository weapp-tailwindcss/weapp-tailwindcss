import type { FrameworkEnvironment } from './environment-snapshot'
import type { FrameworkPolicyInput } from './types'
import type { FrameworkPolicy } from '@/compiler/framework-policy'
import { normalizeFrameworkStylePlatform } from '@weapp-tailwindcss/env'

export function applyMpxPolicy(policy: FrameworkPolicy, input: FrameworkPolicyInput, environment: FrameworkEnvironment): FrameworkPolicy {
  if (input.appType !== 'mpx' || input.platform) {
    return policy
  }
  return {
    ...policy,
    contextDefaults: {
      platform: normalizeFrameworkStylePlatform(environment.mpxPlatform, input.appType),
    },
  }
}
