import type { FrameworkPolicyInput } from './types'
import type { FrameworkPolicy } from '@/compiler/framework-policy'
import { normalizeFrameworkStylePlatform, resolveMpxPlatform } from '@weapp-tailwindcss/env'

export function applyMpxPolicy(policy: FrameworkPolicy, input: FrameworkPolicyInput): FrameworkPolicy {
  if (input.appType !== 'mpx' || input.platform) {
    return policy
  }
  return {
    ...policy,
    contextDefaults: {
      platform: normalizeFrameworkStylePlatform(resolveMpxPlatform().normalized, input.appType),
    },
  }
}
