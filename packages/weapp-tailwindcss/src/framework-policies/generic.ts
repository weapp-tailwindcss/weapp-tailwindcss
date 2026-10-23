import type { FrameworkEnvironment } from './environment-snapshot'
import type { FrameworkPolicyInput } from './types'
import type { FrameworkPolicy } from '@/compiler/framework-policy'
import { normalizeFrameworkStylePlatform, resolveUniUtsPlatform } from '@weapp-tailwindcss/env'

export function createGenericFrameworkPolicy(input: FrameworkPolicyInput, environment: FrameworkEnvironment): FrameworkPolicy {
  const outputPlatform = input.platform || environment.uniPlatform || environment.uniUtsPlatform.normalized || ''
  return {
    defaultGeneratorTarget: environment.defaultGeneratorTarget,
    useNativeApp: false,
    stylesEmbeddedInScript: input.nativeStyle === true || resolveUniUtsPlatform(outputPlatform).isApp,
    contextDefaults: input.platform
      ? { platform: normalizeFrameworkStylePlatform(input.platform, input.appType) ?? input.platform }
      : {},
    disableWebRemToRpx: environment.webTarget,
    preserveWebRuntimeProperties: false,
    unsupportedNativeCss: 'warn',
    preflight: { defaults: undefined, localImports: false, suppress: false },
  }
}
