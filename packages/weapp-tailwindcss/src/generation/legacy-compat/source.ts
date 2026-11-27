import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { TailwindResolvedSource } from '@/generator/runtime'
import { readFileSync } from 'node:fs'
import { normalizeLegacyCompatCssSource } from '@weapp-tailwindcss/postcss/transform'
import { resolveCssEntrySource } from '../directives'
import { resolveCssSourceBase } from '../source-resolver'
import { legacyCompatSourceCache, setLimitedCacheValue } from './cache'

export function resolveLegacyCompatCssSource(rawSource: string) {
  const cached = legacyCompatSourceCache.get(rawSource)
  if (cached !== undefined) {
    return cached
  }
  const resolved = normalizeLegacyCompatCssSource(rawSource)
  setLimitedCacheValue(legacyCompatSourceCache, rawSource, resolved)
  return resolved
}

function hasContainerConfigToken(rawSource: string) {
  return rawSource.includes('@config') && /\bcontainer\b/.test(rawSource)
}

export function hasConfiguredContainerCompat(rawSource: string, file: string, cssHandlerOptions: IStyleHandlerOptions) {
  if (hasContainerConfigToken(rawSource)) {
    return true
  }

  const base = resolveCssSourceBase(file, cssHandlerOptions)
  const cssEntrySource = resolveCssEntrySource(rawSource, base)
  if (!cssEntrySource?.config) {
    return false
  }

  try {
    return /\bcontainer\b/.test(readFileSync(cssEntrySource.config, 'utf8'))
  }
  catch {
    return false
  }
}

function hasConfiguredContainerCompatSource(source: TailwindResolvedSource) {
  if (typeof source.css !== 'string') {
    return false
  }
  if (hasContainerConfigToken(source.css)) {
    return true
  }

  const cssEntrySource = resolveCssEntrySource(source.css, source.base)
  if (cssEntrySource?.config) {
    try {
      if (/\bcontainer\b/.test(readFileSync(cssEntrySource.config, 'utf8'))) {
        return true
      }
    }
    catch {
      // 可选配置不可读时忽略，继续走其他兼容判断。
    }
  }

  if ('config' in source && typeof source.config === 'string') {
    try {
      if (/\bcontainer\b/.test(readFileSync(source.config, 'utf8'))) {
        return true
      }
    }
    catch {
      // 可选配置不可读时忽略，继续走其他兼容判断。
    }
  }

  return false
}

export function hasConfiguredContainerCompatSources(sources: TailwindResolvedSource[]) {
  return sources.some(source => hasConfiguredContainerCompatSource(source))
}
