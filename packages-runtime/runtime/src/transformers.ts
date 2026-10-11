import type { EscapeOptions, UnescapeOptions } from '@weapp-tailwindcss/escape'
import type { CreateOptions, Transformers } from './types'
import {
  escape as escapeSelectors,
  MappingChars2String,
  unescape as unescapeSelectors,
} from '@weapp-tailwindcss/escape'
import { registerTransformProbe } from './transformer-probes'

const identity = (value: string) => value
registerTransformProbe(identity, 'identity')

function isConfig<T extends object>(value: boolean | T | undefined): value is T {
  return typeof value === 'object' && value !== null
}

function mergeWithDefaultMap(map?: Record<string, string>) {
  if (!map) {
    return undefined
  }

  if (map === MappingChars2String) {
    return MappingChars2String
  }

  return {
    ...MappingChars2String,
    ...map,
  }
}

function resolveSharedMap(options?: CreateOptions) {
  const { escape, unescape } = options ?? {}

  if (isConfig<EscapeOptions>(escape) && escape.map) {
    return mergeWithDefaultMap(escape.map)!
  }

  if (isConfig<UnescapeOptions>(unescape) && unescape.map) {
    return mergeWithDefaultMap(unescape.map)!
  }

  return MappingChars2String
}

export function resolveTransformers(options?: CreateOptions): Transformers {
  const sharedMap = resolveSharedMap(options)
  const escapeConfig = options?.escape
  const unescapeConfig = options?.unescape

  const escapeEnabled = escapeConfig !== false
  const unescapeEnabled = unescapeConfig !== false

  let escapeOptions: EscapeOptions | undefined
  if (escapeEnabled) {
    if (isConfig<EscapeOptions>(escapeConfig)) {
      escapeOptions = {
        ...escapeConfig,
        map: mergeWithDefaultMap(escapeConfig.map) ?? sharedMap,
      }
    }
    else {
      escapeOptions = { map: sharedMap }
    }
  }

  let unescapeOptions: UnescapeOptions | undefined
  if (unescapeEnabled) {
    if (isConfig<UnescapeOptions>(unescapeConfig)) {
      unescapeOptions = {
        ...unescapeConfig,
        map: mergeWithDefaultMap(unescapeConfig.map) ?? sharedMap,
      }
    }
    else {
      unescapeOptions = { map: sharedMap }
    }
  }

  const escapeFn = escapeEnabled
    ? (value: string) => escapeSelectors(value, escapeOptions)
    : identity

  const unescapeFn = unescapeEnabled
    ? (value: string) => unescapeSelectors(value, unescapeOptions)
    : identity

  if (sharedMap === MappingChars2String) {
    if (escapeEnabled && !isConfig(escapeConfig)) {
      registerTransformProbe(escapeFn, 'escape')
    }
    if (unescapeEnabled && !isConfig(unescapeConfig)) {
      registerTransformProbe(unescapeFn, 'unescape')
    }
  }

  return {
    escape: escapeFn,
    unescape: unescapeFn,
  }
}

export {
  identity,
}
