import type { CanonicalPlatform, FrameworkEnv, PlatformIdentityInfo, UniPlatformInfo } from './types'
import { getProcessEnv } from './environment'

const MPX_TO_UNI_PLATFORM = new Map<string, CanonicalPlatform>([
  ['ali', 'mp-alipay'],
  ['dd', 'mp-dingtalk'],
  ['jd', 'mp-jd'],
  ['qq', 'mp-qq'],
  ['swan', 'mp-baidu'],
  ['tt', 'mp-toutiao'],
  ['wx', 'mp-weixin'],
])

const MINI_PROGRAM_PLATFORMS = new Map<string, CanonicalPlatform>([
  ...[...MPX_TO_UNI_PLATFORM].filter(([alias]) => alias !== 'ali' && alias !== 'dd'),
  ['alipay', 'mp-alipay'],
  ['baidu', 'mp-baidu'],
  ['weapp', 'mp-weixin'],
  ['wechat', 'mp-weixin'],
])

const CANONICAL_PLATFORMS = new Map<string, CanonicalPlatform>([
  ...[...MPX_TO_UNI_PLATFORM.values()].map(value => [value, value] as const),
  ['web', 'web'],
  ['h5', 'web'],
  ['app', 'app'],
  ['app-plus', 'app-plus'],
  ['app-android', 'app-android'],
  ['app-ios', 'app-ios'],
  ['app-harmony', 'app-harmony'],
])
function normalizePlatform(value: string | undefined) {
  return value?.trim().toLowerCase() || undefined
}

function resolvePlatformInfo(value: string | undefined, appType?: string): UniPlatformInfo {
  const normalized = normalizePlatform(value)
  const isAppAndroid = normalized === 'app-android'
  const isAppIos = normalized === 'app-ios'
  const isAppHarmony = normalized === 'app-harmony'
  const isApp = normalized?.startsWith('app-') === true || normalized === 'app' || normalized === 'app-plus'
  const isMp = normalized?.startsWith('mp-') === true || (normalized
    ? MINI_PROGRAM_PLATFORMS.has(normalized) || (appType === 'mpx' && MPX_TO_UNI_PLATFORM.has(normalized))
    : false)
  const isWeb = normalized?.startsWith('web') === true || normalized === 'h5'

  return {
    raw: value,
    normalized,
    isApp,
    isAppAndroid,
    isAppHarmony,
    isAppIos,
    isMp,
    isWeb,
  }
}

export function resolvePlatform(value: string | undefined) {
  return resolvePlatformInfo(value)
}

export function resolveTaroPlatform(value: string | undefined = getProcessEnv().TARO_ENV) {
  return resolvePlatform(value)
}

function resolveMpxPlatformValue(env: FrameworkEnv = getProcessEnv()) {
  return env.MPX_CURRENT_TARGET_MODE ?? env.MPX_CLI_MODE
}

export function resolveMpxPlatform(value: string | undefined = resolveMpxPlatformValue()) {
  return resolvePlatformInfo(value, 'mpx')
}

export function resolveUniPlatform(value: string | undefined = getProcessEnv().UNI_PLATFORM) {
  return resolvePlatform(value)
}

export function resolveUniUtsPlatform(value: string | undefined = getProcessEnv().UNI_UTS_PLATFORM) {
  return resolvePlatform(value)
}

export function resolveUniAppXPlatform(value: string | undefined = getProcessEnv().UNI_UTS_PLATFORM) {
  return resolvePlatform(value)
}

export function resolveUniPlatformsFromEnv(env: FrameworkEnv = getProcessEnv()) {
  return {
    uniPlatform: resolvePlatform(env.UNI_PLATFORM),
    uniAppXPlatform: resolvePlatform(env.UNI_UTS_PLATFORM),
    uniUtsPlatform: resolvePlatform(env.UNI_UTS_PLATFORM),
  }
}

export function normalizeFrameworkStylePlatform(
  platform: string | undefined,
  appType: string | undefined,
) {
  const normalized = platform?.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }
  if (appType === 'mpx') {
    return MPX_TO_UNI_PLATFORM.get(normalized) ?? normalized
  }
  return normalized
}

export function resolvePlatformIdentity(
  platform: string | undefined,
  appType?: string,
): PlatformIdentityInfo {
  const normalized = normalizePlatform(platform)
  const canonical = normalized
    ? (appType === 'mpx' ? MPX_TO_UNI_PLATFORM.get(normalized) : undefined)
    ?? MINI_PROGRAM_PLATFORMS.get(normalized)
    ?? CANONICAL_PLATFORMS.get(normalized)
    : undefined
  return { raw: platform, normalized, canonical }
}
