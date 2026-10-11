import type { UserDefinedOptions } from '@/types'

const DEFAULT_COMPONENT_LOCAL_STYLES_OPTIONS: ResolvedUniAppXComponentLocalStylesOptions = {
  enabled: true,
  onlyWhenStyleIsolationVersion2: true,
}

const DISABLED_COMPONENT_LOCAL_STYLES_OPTIONS: ResolvedUniAppXComponentLocalStylesOptions = {
  enabled: false,
  onlyWhenStyleIsolationVersion2: true,
}

export interface ResolvedUniAppXComponentLocalStylesOptions {
  componentMatcher?: ((id: string) => boolean) | undefined
  enabled: boolean
  onlyWhenStyleIsolationVersion2: boolean
  pageMatcher?: ((id: string) => boolean) | undefined
}

export interface ResolvedUniAppXOptions {
  enabled: boolean
  componentLocalStyles: ResolvedUniAppXComponentLocalStylesOptions
  uvueUnsupported: 'error' | 'warn' | 'silent'
}

function isBooleanUniAppXShortcut(
  option: UserDefinedOptions['uniAppX'],
): option is boolean | undefined {
  return option === true || option === false || option === undefined
}

function resolveComponentLocalStyles(
  option: UserDefinedOptions['uniAppX'],
): ResolvedUniAppXComponentLocalStylesOptions {
  if (isBooleanUniAppXShortcut(option)) {
    return DISABLED_COMPONENT_LOCAL_STYLES_OPTIONS
  }

  const componentLocalStyles = option.componentLocalStyles
  if (componentLocalStyles === false) {
    return DISABLED_COMPONENT_LOCAL_STYLES_OPTIONS
  }

  if (componentLocalStyles === true || componentLocalStyles === undefined) {
    return DEFAULT_COMPONENT_LOCAL_STYLES_OPTIONS
  }

  return {
    ...(componentLocalStyles.componentMatcher ? { componentMatcher: componentLocalStyles.componentMatcher } : {}),
    enabled: componentLocalStyles.enabled !== false,
    onlyWhenStyleIsolationVersion2: componentLocalStyles.onlyWhenStyleIsolationVersion2 !== false,
    ...(componentLocalStyles.pageMatcher ? { pageMatcher: componentLocalStyles.pageMatcher } : {}),
  }
}

export function resolveUniAppXOptions(option: UserDefinedOptions['uniAppX']): ResolvedUniAppXOptions {
  if (typeof option === 'object' && option) {
    return {
      enabled: option.enabled !== false,
      componentLocalStyles: resolveComponentLocalStyles(option),
      uvueUnsupported: option.uvueUnsupported ?? 'warn',
    }
  }

  return {
    enabled: Boolean(option),
    componentLocalStyles: resolveComponentLocalStyles(option),
    uvueUnsupported: 'warn',
  }
}

export function isUniAppXEnabled(option: UserDefinedOptions['uniAppX']) {
  return resolveUniAppXOptions(option).enabled
}
