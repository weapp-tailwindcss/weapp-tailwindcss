import type { Buffer } from 'node:buffer'
import type { CacheSource } from './source'
import { LRUCache } from 'lru-cache'
import { md5Hash } from './md5'

export interface HashMapValue {
  hash: string
  changed: boolean
}

export type HashMapKey = string | number

export type CacheValue = CacheSource | string

export interface CacheProcessResult<T extends CacheValue> {
  result: T
  cacheValue?: CacheValue | undefined
}

export interface CacheProcessOptions<T extends CacheValue> {
  key: string
  hashKey?: HashMapKey | undefined
  rawSource?: string | Buffer | undefined
  hash?: string | undefined
  resolveCache?: (() => T | undefined) | undefined
  transform: () => Promise<CacheProcessResult<T> | T>
  onCacheHit?: ((value: T) => void | Promise<void>) | undefined
}

export interface ICreateCacheReturnType {
  readonly hashMap: Map<HashMapKey, HashMapValue>
  readonly instance: LRUCache<string, CacheValue>
  hasHashKey: (key: HashMapKey) => boolean
  getHashValue: (key: HashMapKey) => HashMapValue | undefined
  setHashValue: (key: HashMapKey, value: HashMapValue) => Map<HashMapKey, HashMapValue>
  computeHash: (message: string | Buffer) => string
  get: <V extends CacheValue = CacheSource>(key: string) => V | undefined
  set: <V extends CacheValue = CacheSource>(key: string, value: V) => LRUCache<string, CacheValue>
  has: (key: string) => boolean
  calcHashValueChanged: (key: HashMapKey, hash: string) => ICreateCacheReturnType
  prune?: (options: {
    cacheKeys?: Iterable<string> | undefined
    hashKeys?: Iterable<HashMapKey> | undefined
  }) => void
  pruneHashKeys?: (hashKeys: Iterable<HashMapKey>) => void
  process: <T extends CacheValue>(options: CacheProcessOptions<T>) => Promise<T>
}

function isProcessResult<T extends CacheValue>(value: CacheProcessResult<T> | T): value is CacheProcessResult<T> {
  return typeof value === 'object' && value !== null && 'result' in value
}

function createCache(options?: boolean): ICreateCacheReturnType {
  const disabled = options === false
  const hashMap = new Map<HashMapKey, HashMapValue>()
  const instance = new LRUCache<string, CacheValue>({
    // 可能会添加和删除一些页面和组件, 先设定 1024 吧
    max: 1024,
    ttl: 0,
    ttlAutopurge: false,
  })

  const cache: ICreateCacheReturnType = {
    hashMap,
    instance,
    hasHashKey(key) {
      return hashMap.has(key)
    },
    getHashValue(key) {
      return hashMap.get(key)
    },
    setHashValue(key, value) {
      return hashMap.set(key, value)
    },
    get<T>(key: string) {
      return instance.get(key) as T
    },
    set(key, value) {
      return instance.set(key, value)
    },
    computeHash(message) {
      return md5Hash(message)
    },
    calcHashValueChanged(key, hash) {
      const hit = hashMap.get(key)
      if (hit) {
        hashMap.set(key, {
          changed: hash !== hit.hash,
          hash,
        })
      }
      else {
        hashMap.set(key, {
          changed: true,
          hash,
        })
      }
      return cache
    },
    pruneHashKeys(hashKeys) {
      const activeHashKeys = new Set(hashKeys)
      for (const key of hashMap.keys()) {
        if (!activeHashKeys.has(key)) {
          hashMap.delete(key)
        }
      }
    },
    prune(options) {
      if (options.cacheKeys) {
        const cacheKeys = new Set(options.cacheKeys)
        for (const key of instance.keys()) {
          if (!cacheKeys.has(key)) {
            instance.delete(key)
          }
        }
      }
      if (options.hashKeys) {
        cache.pruneHashKeys?.(options.hashKeys)
      }
    },
    has(key) {
      return instance.has(key)
    },
    async process({
      key,
      hashKey,
      rawSource,
      hash,
      resolveCache,
      transform,
      onCacheHit,
    }) {
      if (disabled) {
        const value = await transform()
        return isProcessResult(value) ? value.result : value
      }

      const cacheHashKey = hashKey ?? key
      let hasChanged = true

      if (hash != null || rawSource != null) {
        const nextHash = hash ?? cache.computeHash(rawSource as string | Buffer)
        cache.calcHashValueChanged(cacheHashKey, nextHash)
        const entry = cache.getHashValue(cacheHashKey)
        hasChanged = entry?.changed ?? true
      }

      const readCache = resolveCache ?? (() => cache.get(key))

      if (!hasChanged) {
        const cached = readCache()
        if (cached !== undefined) {
          await onCacheHit?.(cached)
          return cached
        }
      }

      const value = await transform()
      const normalized = isProcessResult(value) ? value : { result: value }
      const stored = (normalized.cacheValue ?? normalized.result) as CacheValue
      cache.set(key, stored)
      return normalized.result
    },
  }

  return cache
}

function initializeCache(cacheConfig?: boolean | ICreateCacheReturnType): ICreateCacheReturnType {
  if (typeof cacheConfig === 'boolean' || cacheConfig === undefined) {
    return createCache(cacheConfig)
  }
  return cacheConfig
}

export { createCache, initializeCache }
