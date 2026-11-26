import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import { stableSerialize } from '@/utils/stable-serialize'

const LEGACY_COMPAT_CACHE_LIMIT = 128

export const legacyCompatSourceCache = new Map<string, string>()
export const legacyCompatTransformCache = new Map<string, string>()

export function setLimitedCacheValue(cache: Map<string, string>, key: string, value: string) {
  if (cache.size >= LEGACY_COMPAT_CACHE_LIMIT) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) {
      cache.delete(firstKey)
    }
  }
  cache.set(key, value)
}

export function createLegacyCompatTransformCacheKey(source: string, options: IStyleHandlerOptions) {
  return `${stableSerialize(options)}\0${source}`
}
