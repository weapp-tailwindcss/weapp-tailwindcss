import type { IJsHandlerOptions, JsHandlerResult } from '../types'
import { LRUCache } from 'lru-cache'
import { md5Hash } from '../cache/md5'
import { defaultJsPreserveClass } from './default-preserve'
import { getJsOptionsSignature } from './options-signature'

const RESULT_CACHE_MAX = 512
const CACHEABLE_SOURCE_MAX_LENGTH = 512
const classNameSetVersions = new WeakMap<Set<string>, { version: number, values: string[] }>()
let nextClassNameSetVersion = 0

function getClassNameSetVersion(set?: Set<string>) {
  if (!set) {
    return 'none'
  }
  const cached = classNameSetVersions.get(set)
  if (cached && cached.values.length === set.size && cached.values.every(value => set.has(value))) {
    return cached.version
  }
  const version = nextClassNameSetVersion++
  classNameSetVersions.set(set, { version, values: [...set] })
  return version
}

/** 只接收 handler 入口拥有的配置快照；自定义回调的闭包状态不能作为缓存键。 */
export function createJsResultCache() {
  const cache = new LRUCache<string, JsHandlerResult>({ max: RESULT_CACHE_MAX })
  const fingerprints = new WeakMap<IJsHandlerOptions, string>()

  return {
    key(source: string, options: IJsHandlerOptions) {
      if (!source.length || source.length > CACHEABLE_SOURCE_MAX_LENGTH || options.moduleGraph || options.filename
        || (options.jsPreserveClass && options.jsPreserveClass !== defaultJsPreserveClass)) {
        return undefined
      }
      let fingerprint = fingerprints.get(options)
      if (fingerprint === undefined) {
        fingerprint = getJsOptionsSignature(options)
        if (fingerprint === undefined) {
          return undefined
        }
        fingerprints.set(options, fingerprint)
      }
      return `${getClassNameSetVersion(options.classNameSet)}:${fingerprint}:${md5Hash(source)}`
    },
    get(key: string | undefined) {
      return key === undefined ? undefined : cache.get(key)
    },
    set(key: string | undefined, result: JsHandlerResult) {
      if (key !== undefined && !result.error && !result.linked) {
        cache.set(key, result)
      }
      return result
    },
  }
}
