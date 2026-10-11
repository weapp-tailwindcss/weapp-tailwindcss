import type { Buffer } from 'node:buffer'

export interface CacheSourceMap {
  version: number
  sources: string[]
  names: string[]
  sourceRoot?: string
  sourcesContent?: string[]
  mappings: string
  file: string
}

export interface CacheMapOptions {
  columns?: boolean
  module?: boolean
}

export interface CacheHash {
  update: (data: string | Buffer, inputEncoding?: string) => CacheHash
  digest: (encoding?: string) => string | Buffer
}

/** 缓存接受的源码值协议；构建器适配器提供满足此协议的对象。 */
export interface CacheSource {
  source: () => string | Buffer
  buffer: () => Buffer
  size: () => number
  map: (options?: CacheMapOptions) => CacheSourceMap | null
  sourceAndMap: (options?: CacheMapOptions) => { source: string | Buffer, map: CacheSourceMap | null }
  updateHash: (hash: CacheHash) => void
}
