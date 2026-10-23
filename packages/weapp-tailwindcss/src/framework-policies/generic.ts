import type { FrameworkPolicyInput } from './types'
import type { FrameworkPolicy } from '@/compiler/framework-policy'
import { normalizeFrameworkStylePlatform } from '@weapp-tailwindcss/env'
import { inferGeneratorTargetFromEnv, shouldUseWebGeneratorTargetFromEnv } from './environment'

export function createGenericFrameworkPolicy(input: FrameworkPolicyInput): FrameworkPolicy {
  return {
    defaultGeneratorTarget: inferGeneratorTargetFromEnv(),
    useNativeApp: false,
    contextDefaults: input.platform
      ? { platform: normalizeFrameworkStylePlatform(input.platform, input.appType) ?? input.platform }
      : {},
    disableWebRemToRpx: shouldUseWebGeneratorTargetFromEnv(),
    preserveWebRuntimeProperties: false,
    unsupportedNativeCss: 'warn',
    preflight: { defaults: undefined, localImports: false, suppress: false },
  }
}
