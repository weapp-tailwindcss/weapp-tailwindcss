import type { IStyleHandlerOptions } from './types'
import { defuOverrideArray } from '@weapp-tailwindcss/shared'
import { LRUCache } from 'lru-cache'
import { fingerprintOptions, fingerprintStyleOptions } from './fingerprint'

const SIMPLE_OVERRIDE_UNSET = '__unset__'
const CSS_OPTION_KEYS = [
  'cssPreflight',
  'cssPreflightRange',
  'cssChildCombinatorReplaceValue',
  'cssPresetEnv',
  'autoprefixer',
  'injectAdditionalCssVarScope',
  'cssSelectorReplacement',
  'rem2rpx',
  'px2rpx',
  'unitsToPx',
  'unitConversion',
  'platform',
  'cssRemoveActivePseudoClass',
  'cssRemoveHoverPseudoClass',
  'cssRemoveFocusPseudoClass',
  'cssRemoveProperty',
  'cssCalc',
  'atRules',
  'tailwindcssV4GradientFallback',
] as const

function getSimpleOverrideCacheKey(options: Partial<IStyleHandlerOptions>) {
  let isMainChunk = SIMPLE_OVERRIDE_UNSET
  let majorVersion = SIMPLE_OVERRIDE_UNSET
  let cssRemoveProperty = SIMPLE_OVERRIDE_UNSET
  let cssRemoveActivePseudoClass = SIMPLE_OVERRIDE_UNSET
  let cssRemoveHoverPseudoClass = SIMPLE_OVERRIDE_UNSET
  let cssRemoveFocusPseudoClass = SIMPLE_OVERRIDE_UNSET
  let uniAppX = SIMPLE_OVERRIDE_UNSET
  let cssPreflightRange = SIMPLE_OVERRIDE_UNSET
  let injectAdditionalCssVarScope = SIMPLE_OVERRIDE_UNSET
  let rem2rpx = SIMPLE_OVERRIDE_UNSET
  let px2rpx = SIMPLE_OVERRIDE_UNSET
  let unitsToPx = SIMPLE_OVERRIDE_UNSET
  let unitConversion = SIMPLE_OVERRIDE_UNSET
  let platform = SIMPLE_OVERRIDE_UNSET
  let cssCalc = SIMPLE_OVERRIDE_UNSET
  let cssChildCombinatorReplaceValue = SIMPLE_OVERRIDE_UNSET
  let cssPreflight = SIMPLE_OVERRIDE_UNSET
  let autoprefixer = SIMPLE_OVERRIDE_UNSET

  for (const key of Object.keys(options) as Array<keyof IStyleHandlerOptions>) {
    const value = options[key]
    switch (key) {
      case 'isMainChunk':
        if (typeof value !== 'boolean') {
          return undefined
        }
        isMainChunk = value ? '1' : '0'
        break
      case 'majorVersion':
        if (typeof value !== 'number') {
          return undefined
        }
        majorVersion = String(value)
        break
      case 'cssRemoveProperty':
        if (typeof value !== 'boolean') {
          return undefined
        }
        cssRemoveProperty = value ? '1' : '0'
        break
      case 'cssRemoveHoverPseudoClass':
        if (typeof value !== 'boolean') {
          return undefined
        }
        cssRemoveHoverPseudoClass = value ? '1' : '0'
        break
      case 'cssRemoveActivePseudoClass':
        if (typeof value !== 'boolean') {
          return undefined
        }
        cssRemoveActivePseudoClass = value ? '1' : '0'
        break
      case 'cssRemoveFocusPseudoClass':
        if (typeof value !== 'boolean') {
          return undefined
        }
        cssRemoveFocusPseudoClass = value ? '1' : '0'
        break
      case 'uniAppX':
        if (typeof value !== 'boolean') {
          return undefined
        }
        uniAppX = value ? '1' : '0'
        break
      case 'cssPreflightRange':
        if (typeof value !== 'string') {
          return undefined
        }
        cssPreflightRange = value
        break
      case 'injectAdditionalCssVarScope':
        if (typeof value !== 'boolean') {
          return undefined
        }
        injectAdditionalCssVarScope = value ? '1' : '0'
        break
      case 'rem2rpx':
        if (typeof value !== 'boolean') {
          return undefined
        }
        rem2rpx = value ? '1' : '0'
        break
      case 'px2rpx':
        if (typeof value !== 'boolean') {
          return undefined
        }
        px2rpx = value ? '1' : '0'
        break
      case 'unitsToPx':
        if (typeof value !== 'boolean') {
          return undefined
        }
        unitsToPx = value ? '1' : '0'
        break
      case 'unitConversion':
        if (value !== false) {
          return undefined
        }
        unitConversion = '0'
        break
      case 'platform':
        if (typeof value !== 'string') {
          return undefined
        }
        platform = value
        break
      case 'cssCalc':
        if (typeof value !== 'boolean') {
          return undefined
        }
        cssCalc = value ? '1' : '0'
        break
      case 'cssChildCombinatorReplaceValue':
        if (typeof value !== 'string') {
          return undefined
        }
        cssChildCombinatorReplaceValue = value
        break
      case 'cssPreflight':
        if (value !== false) {
          return undefined
        }
        cssPreflight = '0'
        break
      case 'autoprefixer':
        if (typeof value !== 'boolean') {
          return undefined
        }
        autoprefixer = value ? '1' : '0'
        break
      default:
        return undefined
    }
  }

  return [
    'simple',
    isMainChunk,
    majorVersion,
    cssRemoveProperty,
    cssRemoveActivePseudoClass,
    cssRemoveHoverPseudoClass,
    cssRemoveFocusPseudoClass,
    uniAppX,
    cssPreflightRange,
    injectAdditionalCssVarScope,
    rem2rpx,
    px2rpx,
    unitsToPx,
    unitConversion,
    platform,
    cssCalc,
    cssChildCombinatorReplaceValue,
    cssPreflight,
    autoprefixer,
  ].join(':')
}

function hasOverrides(options?: Partial<IStyleHandlerOptions>): options is Partial<IStyleHandlerOptions> {
  return Boolean(options && Object.keys(options).length > 0)
}

export function normalizeCssOptions<T extends Partial<IStyleHandlerOptions>>(options: T, mirrorTopLevel = false): T {
  let changed = false
  const normalized = { ...options }
  const hasCssOptions = options.cssOptions !== undefined
  const cssOptions = { ...(options.cssOptions ?? {}) }
  for (const key of CSS_OPTION_KEYS) {
    const hasNestedValue = hasCssOptions && key in options.cssOptions!
    const hasTopLevelValue = key in options
    if (!hasNestedValue && !hasTopLevelValue) {
      continue
    }
    const nestedValue = hasNestedValue ? options.cssOptions?.[key] : undefined
    const topLevelValue = hasTopLevelValue ? options[key] : undefined
    const value = hasNestedValue ? nestedValue : topLevelValue
    if (value !== topLevelValue) {
      normalized[key] = value as never
      changed = true
    }
    if ((hasCssOptions || mirrorTopLevel) && value !== nestedValue) {
      cssOptions[key] = value as never
      changed = true
    }
  }
  if (!changed) {
    return options
  }
  return {
    ...normalized,
    ...(hasCssOptions || mirrorTopLevel ? { cssOptions } : {}),
  }
}

export interface OptionsResolver {
  resolve: (overrides?: Partial<IStyleHandlerOptions>) => IStyleHandlerOptions
}

export function createOptionsResolver(baseOptions: IStyleHandlerOptions): OptionsResolver {
  const normalizedBaseOptions = normalizeCssOptions(baseOptions)
  const cacheByKey = new LRUCache<string, { options: IStyleHandlerOptions, fingerprint: string }>({ max: 256 })

  const resolve = (overrides?: Partial<IStyleHandlerOptions>) => {
    if (!overrides) {
      return normalizedBaseOptions
    }

    if (!hasOverrides(overrides)) {
      return normalizedBaseOptions
    }

    // 调用方可以原位修改 Map、白名单或嵌套选项，不能只按对象身份复用旧签名。
    const key = getSimpleOverrideCacheKey(overrides) ?? fingerprintOptions(overrides)

    const cached = cacheByKey.get(key)
    if (cached && fingerprintStyleOptions(cached.options) === cached.fingerprint) {
      return cached.options
    }

    const normalizedOverrides = normalizeCssOptions({ ...overrides }, true)
    // 调用阶段新引入 cssOptions 时，也须把基线默认值镜像到同一层，避免 undefined 清空安全 preset。
    const base = normalizedOverrides.cssOptions === undefined
      ? normalizedBaseOptions
      : normalizeCssOptions(normalizedBaseOptions, true)
    const merged = defuOverrideArray<
      IStyleHandlerOptions,
      Partial<IStyleHandlerOptions>[]
    >(
      normalizedOverrides as IStyleHandlerOptions,
      base,
    )
    const normalized = normalizeCssOptions(merged)
    cacheByKey.set(key, { options: normalized, fingerprint: fingerprintStyleOptions(normalized) })
    return normalized
  }

  return {
    resolve,
  }
}
