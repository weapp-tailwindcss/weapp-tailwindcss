import type { IStyleHandlerOptions } from '../../types'
import { defuOverrideArray } from '@weapp-tailwindcss/shared'
import { createInjectPreflight } from '../../preflight'

const FALLBACK_PLACEHOLDER_SUFFIXES = [':not(#n)', ':not(#\\#)']

function normalizeSelectorList(value?: string | string[] | false) {
  if (value === undefined || value === false) {
    return []
  }
  return Array.isArray(value) ? value.filter(Boolean) : [value]
}

function getSpecificityMatchingName(options: IStyleHandlerOptions) {
  const feature = options.cssPresetEnv?.features?.['is-pseudo-class']
  if (feature && typeof feature === 'object' && 'specificityMatchingName' in feature) {
    const specificityName = (feature as { specificityMatchingName?: string }).specificityMatchingName
    return typeof specificityName === 'string' && specificityName.length > 0 ? specificityName : undefined
  }
  return undefined
}

export function createRootSpecificityReplacer(options: IStyleHandlerOptions) {
  const specificityMatchingName = getSpecificityMatchingName(options)
  const selectors = normalizeSelectorList(options.cssSelectorReplacement?.root)
  const replaceFallbackPlaceholder = (code: string) => {
    let output = code
    for (const suffix of FALLBACK_PLACEHOLDER_SUFFIXES) {
      if (output.includes(suffix)) {
        output = output.split(suffix).join('')
      }
    }
    return output
  }
  if (!specificityMatchingName || selectors.length === 0) {
    return replaceFallbackPlaceholder
  }

  const suffix = `:not(.${specificityMatchingName})`
  const targets = selectors
    .map(selector => selector?.trim())
    .filter((selector): selector is string => Boolean(selector?.length))
    .map(selector => ({
      match: `${selector}${suffix}`,
      spacedMatch: `${selector} ${suffix}`,
      replacement: selector,
    }))

  if (!targets.length) {
    return undefined
  }

  return (code: string) => {
    let output = replaceFallbackPlaceholder(code)
    for (const target of targets) {
      if (output.includes(target.match)) {
        output = output.split(target.match).join(target.replacement)
      }
      if (output.includes(target.spacedMatch)) {
        output = output.split(target.spacedMatch).join(target.replacement)
      }
    }
    return output
  }
}

function getLightningDefaultOptions(options?: Partial<IStyleHandlerOptions>): Partial<IStyleHandlerOptions> {
  const customPropertiesFeature = options?.cssPresetEnv?.features?.['custom-properties']
  const shouldPreserveCustomProperties = customPropertiesFeature !== undefined
    ? customPropertiesFeature
    : options?.cssCalc && options.cssCalc !== 'auto'
      ? { preserve: true }
      : false

  return {
    cssPresetEnv: {
      features: {
        'cascade-layers': true,
        'is-pseudo-class': {
          specificityMatchingName: 'weapp-tw-ig',
        },
        'oklab-function': true,
        'color-mix': true,
        'custom-properties': shouldPreserveCustomProperties,
      },
      autoprefixer: {
        add: false,
      },
    },
    cssRemoveProperty: true,
    cssRemoveHoverPseudoClass: true,
    cssChildCombinatorReplaceValue: ['view', 'text'],
    cssSelectorReplacement: {
      root: ['page', '.tw-root', 'wx-root-portal-content'],
      universal: ['view', 'text'],
    },
  }
}

export function prepareStyleOptions(options?: Partial<IStyleHandlerOptions>): IStyleHandlerOptions {
  const merged = defuOverrideArray<IStyleHandlerOptions, Partial<IStyleHandlerOptions>[]>(
    options as IStyleHandlerOptions,
    getLightningDefaultOptions(options),
  )
  merged.cssInjectPreflight = createInjectPreflight(merged.cssPreflight)
  return merged
}
