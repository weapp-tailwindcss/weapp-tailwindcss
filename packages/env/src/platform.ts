import type { FrameworkEnv, UniPlatformInfo } from './types'
import { getProcessEnv } from './environment'

const MINI_PROGRAM_PLATFORMS = new Set([
  'alipay',
  'baidu',
  'jd',
  'qq',
  'swan',
  'tt',
  'weapp',
  'wechat',
  'wx',
])
function normalizePlatform(value: string | undefined) {
  return value?.trim().toLowerCase() || undefined
}

function resolvePlatformInfo(value: string | undefined): UniPlatformInfo {
  const normalized = normalizePlatform(value)
  const isAppAndroid = normalized === 'app-android'
  const isAppIos = normalized === 'app-ios'
  const isAppHarmony = normalized === 'app-harmony'
  const isApp = normalized?.startsWith('app-') === true || normalized === 'app' || normalized === 'app-plus'
  const isMp = normalized?.startsWith('mp-') === true || (normalized ? MINI_PROGRAM_PLATFORMS.has(normalized) : false)
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

/** 读取 Taro 环境快照；省略快照时才使用调用时的进程环境。 */
export function resolveTaroPlatformFromEnv(env: FrameworkEnv = getProcessEnv()) {
  return resolvePlatform(env.TARO_ENV)
}

function resolveMpxPlatformValue(env: FrameworkEnv = getProcessEnv()) {
  return env.MPX_CURRENT_TARGET_MODE ?? env.MPX_CLI_MODE
}

export function resolveMpxPlatform(value: string | undefined = resolveMpxPlatformValue()) {
  return resolvePlatform(value)
}

/** 读取 MPX 环境快照，保留 current mode 的空字符串优先级。 */
export function resolveMpxPlatformFromEnv(env: FrameworkEnv = getProcessEnv()) {
  return resolvePlatform(resolveMpxPlatformValue(env))
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

const MPX_TO_UNI_PLATFORM: Record<string, string> = {
  ali: 'mp-alipay',
  dd: 'mp-dingtalk',
  jd: 'mp-jd',
  qq: 'mp-qq',
  swan: 'mp-baidu',
  tt: 'mp-toutiao',
  wx: 'mp-weixin',
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
    return MPX_TO_UNI_PLATFORM[normalized] ?? normalized
  }
  return normalized
}
