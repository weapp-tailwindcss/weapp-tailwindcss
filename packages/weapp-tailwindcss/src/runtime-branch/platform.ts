import type { NativeAppPlatform, RuntimeBranchContext } from './types'
import type { UniUtsPlatformInfo } from '@/utils'
import { resolveUniUtsPlatform } from '@/utils'

export { isRuntimeUniAppXEnabled } from '@/framework-policies/resolve'

export function normalizeRuntimeUniUtsPlatform(value: RuntimeBranchContext['uniUtsPlatform']) {
  return typeof value === 'object' && value !== null
    ? value
    : resolveUniUtsPlatform(value)
}

export function resolveNativeAppPlatform(platform: UniUtsPlatformInfo): NativeAppPlatform {
  if (platform.isAppAndroid) {
    return 'android'
  }
  if (platform.isAppIos) {
    return 'ios'
  }
  if (platform.isAppHarmony) {
    return 'harmony'
  }
  return 'unknown'
}

export function resolveExplicitOrEnvPlatform(
  context: RuntimeBranchContext,
  uniUtsPlatform: UniUtsPlatformInfo,
) {
  if (typeof context.platform === 'string' && context.platform.length > 0) {
    return context.platform
  }
  return uniUtsPlatform.normalized
}
