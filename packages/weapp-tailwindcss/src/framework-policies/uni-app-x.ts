import type { UniUtsPlatformInfo } from '@weapp-tailwindcss/env'
import type { FrameworkPolicyInput } from './types'
import type { FrameworkPolicy } from '@/compiler/framework-policy'

export function isNativeStyleEnabled(value: FrameworkPolicyInput['uniAppX']) {
  return value === true || (typeof value === 'object' && value !== null && value.enabled !== false)
}

export function applyUniAppXPolicy(policy: FrameworkPolicy, input: FrameworkPolicyInput, platform: UniUtsPlatformInfo): FrameworkPolicy {
  const enabled = isNativeStyleEnabled(input.uniAppX)
  const isFramework = input.appType === 'uni-app-x'
  return {
    ...policy,
    useNativeApp: isFramework && enabled && platform.isApp,
    disableWebRemToRpx: isFramework || policy.disableWebRemToRpx,
    preserveWebRuntimeProperties: isFramework,
    unsupportedNativeCss: typeof input.uniAppX === 'object'
      ? input.uniAppX?.uvueUnsupported ?? 'warn'
      : 'warn',
    preflight: {
      defaults: isFramework || enabled
        ? { 'border-width': '0', 'border-style': false, 'border': false }
        : undefined,
      localImports: enabled,
      suppress: input.nativeStyle === true && input.styleTarget === 'uvue',
    },
  }
}
