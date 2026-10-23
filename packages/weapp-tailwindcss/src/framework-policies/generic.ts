import type { FrameworkEnvironment } from './environment-snapshot'
import type { FrameworkPolicyInput } from './types'
import type { FrameworkPolicy } from '@/compiler/framework-policy'
import { normalizeFrameworkStylePlatform } from '@weapp-tailwindcss/env'

export function createGenericFrameworkPolicy(input: FrameworkPolicyInput, environment: FrameworkEnvironment): FrameworkPolicy {
  return {
    defaultGeneratorTarget: environment.defaultGeneratorTarget,
    useNativeApp: false,
    contextDefaults: input.platform
      ? { platform: normalizeFrameworkStylePlatform(input.platform, input.appType) ?? input.platform }
      : {},
    disableWebRemToRpx: environment.webTarget,
    preserveWebRuntimeProperties: false,
    unsupportedNativeCss: 'warn',
    preflight: { defaults: undefined, localImports: false, suppress: false },
  }
}
