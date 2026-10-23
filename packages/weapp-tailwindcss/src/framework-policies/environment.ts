import process from 'node:process'

type WeappTailwindcssGeneratorTarget = 'weapp' | 'web'

export const generatorTargetEnvKeys = [
  'UNI_PLATFORM',
  'UNI_UTS_PLATFORM',
  'MPX_CLI_MODE',
  'MPX_CURRENT_TARGET_MODE',
  'TARO_ENV',
  'WEAPP_TW_TARGET',
  'WEAPP_TAILWINDCSS_TARGET',
] as const

const explicitGeneratorTargetEnvKeys = [
  'WEAPP_TW_TARGET',
  'WEAPP_TAILWINDCSS_TARGET',
] as const

const uniWebPlatformEnvKeys = [
  'UNI_PLATFORM',
  'UNI_UTS_PLATFORM',
] as const

const mpxWebPlatformEnvKeys = [
  'MPX_CLI_MODE',
  'MPX_CURRENT_TARGET_MODE',
] as const

function getEnvValue(key: string): string | undefined {
  return typeof process === 'undefined' ? undefined : process.env[key]
}

function normalizeGeneratorTargetValue(value: string | undefined): WeappTailwindcssGeneratorTarget | undefined {
  return value === 'weapp' || value === 'web' ? value : undefined
}

function isUniWebPlatform(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'h5' || normalized?.startsWith('web') === true
}

function isUniAppWebViewPlatform(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'app' || normalized === 'app-plus'
}

function isUniNativeAppPlatform(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return normalized?.startsWith('app-') === true
}

function isMpxWebPlatform(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'web'
}

function inferGeneratorTargetFromExplicitEnv(): WeappTailwindcssGeneratorTarget | undefined {
  for (const key of explicitGeneratorTargetEnvKeys) {
    const target = normalizeGeneratorTargetValue(getEnvValue(key))
    if (target !== undefined) {
      return target
    }
  }
}

export function shouldUseWebGeneratorTargetFromEnv(): boolean {
  return uniWebPlatformEnvKeys.some(key => isUniWebPlatform(getEnvValue(key)))
    || (
      isUniAppWebViewPlatform(getEnvValue('UNI_PLATFORM'))
      && !isUniNativeAppPlatform(getEnvValue('UNI_UTS_PLATFORM'))
    )
    || mpxWebPlatformEnvKeys.some(key => isMpxWebPlatform(getEnvValue(key)))
    || getEnvValue('TARO_ENV') === 'h5'
}

export function shouldUseUniAppWebRpxCompatibility(appType: string | undefined): boolean {
  return appType === 'uni-app-vite'
    || appType === 'uni-app-x'
    || shouldUseWebGeneratorTargetFromEnv()
}

export function shouldUseUniAppViteWebViewGeneratorTarget(appType: string | undefined, platform: string | undefined = getEnvValue('UNI_PLATFORM')): boolean {
  return appType === 'uni-app-vite' && isUniAppWebViewPlatform(platform)
}

export function inferGeneratorTargetFromEnv(): WeappTailwindcssGeneratorTarget {
  return inferGeneratorTargetFromExplicitEnv()
    ?? (shouldUseWebGeneratorTargetFromEnv() ? 'web' : 'weapp')
}
