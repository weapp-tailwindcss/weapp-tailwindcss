// 解析通用单位转换配置，并按平台选择最终启用的规则
import type { AcceptedPlugin } from 'postcss'
import type { IStyleHandlerOptions, UnitConversionConfig, UnitConversionOptions } from '../types'
import process from 'node:process'
import postcssUnitConverter from 'postcss-rule-unit-converter'

const DEFAULT_PLATFORM_KEYS = ['default', '*'] as const

const PLATFORM_ENV_KEYS = [
  'WEAPP_TW_TARGET',
  'WEAPP_TAILWINDCSS_TARGET',
  'UNI_PLATFORM',
  'UNI_UTS_PLATFORM',
  'TARO_ENV',
  'MPX_CLI_MODE',
  'MPX_CURRENT_TARGET_MODE',
] as const

const PLATFORM_ALIASES: Record<string, string[]> = {
  'weapp': ['mp-weixin', 'weixin', 'wechat', 'wx', 'mp'],
  'mp-weixin': ['weapp', 'weixin', 'wechat', 'wx', 'mp'],
  'wx': ['weapp', 'mp-weixin', 'weixin', 'wechat', 'mp'],
  'h5': ['web'],
  'web': ['h5'],
  'app': ['app-plus', 'app-android', 'app-ios', 'android', 'ios'],
  'app-plus': ['app'],
  'app-android': ['app', 'android'],
  'app-ios': ['app', 'ios'],
  'android': ['app', 'app-android'],
  'ios': ['app', 'app-ios'],
}

function normalizePlatform(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized || undefined
}

function readEnvValue(key: string): string | undefined {
  return typeof process === 'undefined' ? undefined : process.env[key]
}

export function resolveUnitConversionPlatform(options: Pick<IStyleHandlerOptions, 'platform'>): string | undefined {
  const explicit = normalizePlatform(options.platform)
  if (explicit) {
    return explicit
  }

  for (const key of PLATFORM_ENV_KEYS) {
    const value = normalizePlatform(readEnvValue(key))
    if (value) {
      return value
    }
  }

  return undefined
}

function isPlatformUnitConversionOptions(
  options: UnitConversionOptions,
): options is Extract<UnitConversionOptions, { platforms: unknown }> {
  return Boolean(
    options
    && typeof options === 'object'
    && 'platforms' in options,
  )
}

function hasRules(config: UnitConversionConfig): boolean {
  return Array.isArray(config.rules) && config.rules.length > 0
}

function getPlatformCandidateKeys(platform: string | undefined): string[] {
  if (!platform) {
    return []
  }

  const normalized = normalizePlatform(platform)
  if (!normalized) {
    return []
  }

  return [
    normalized,
    ...(PLATFORM_ALIASES[normalized] ?? []),
  ]
}

function getPlatformConfig(
  platforms: Extract<UnitConversionOptions, { platforms: unknown }>['platforms'],
  key: string,
) {
  if (Object.hasOwn(platforms, key)) {
    return platforms[key]
  }

  for (const [platform, config] of Object.entries(platforms)) {
    if (normalizePlatform(platform) === key) {
      return config
    }
  }

  return undefined
}

function resolvePlatformConfig(options: UnitConversionOptions, platform: string | undefined) {
  if (!isPlatformUnitConversionOptions(options)) {
    return options
  }

  const platforms = options.platforms
  for (const key of getPlatformCandidateKeys(platform)) {
    const config = getPlatformConfig(platforms, key)
    if (config !== undefined) {
      return config
    }
  }

  if (options.default !== undefined) {
    return options.default
  }

  for (const key of DEFAULT_PLATFORM_KEYS) {
    const config = getPlatformConfig(platforms, key)
    if (config !== undefined) {
      return config
    }
  }

  return undefined
}

export function resolveUnitConversionConfig(
  options: Pick<IStyleHandlerOptions, 'platform' | 'unitConversion'>,
): UnitConversionConfig | undefined {
  const unitConversion = options.unitConversion
  if (!unitConversion) {
    return undefined
  }

  const config = resolvePlatformConfig(
    unitConversion,
    resolveUnitConversionPlatform(options),
  )
  if (!config || config.disabled || !hasRules(config)) {
    return undefined
  }

  return config
}

export function getUnitConversionPlugin(options: IStyleHandlerOptions): AcceptedPlugin | null {
  const config = resolveUnitConversionConfig(options)
  if (!config) {
    return null
  }

  return postcssUnitConverter(config)
}
