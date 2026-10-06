import type { IJsHandlerOptions } from '../types'
import { types } from 'node:util'

const objectIds = new WeakMap<object, number>()
const frozenOptionSignatures = new WeakMap<object, string | undefined>()
const trustedOptionSnapshots = new WeakSet<object>()
const UNSUPPORTED = Symbol('自定义配置行为')
let nextObjectId = 0

function getObjectId(value: object) {
  let id = objectIds.get(value)
  if (id === undefined) {
    id = nextObjectId++
    objectIds.set(value, id)
  }
  return id
}

function encodeData(value: unknown, parents: Set<object>): unknown {
  if (typeof value === 'function') {
    return ['function', getObjectId(value)]
  }
  if (value === undefined) {
    return ['undefined']
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : ['number', String(value)]
  }
  if (typeof value !== 'object' || types.isProxy(value) || parents.has(value)) {
    return UNSUPPORTED
  }
  const prototype = Object.getPrototypeOf(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (prototype === RegExp.prototype) {
    if (Reflect.ownKeys(descriptors).some(key => key !== 'lastIndex') || (value as RegExp).sticky) {
      return UNSUPPORTED
    }
    return ['regexp', (value as RegExp).source, (value as RegExp).flags]
  }
  if (prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype) {
    return UNSUPPORTED
  }
  parents.add(value)
  const entries: unknown[] = []
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !('value' in descriptors[key]!)) {
      return UNSUPPORTED
    }
    const encoded = encodeData(descriptors[key]!.value, parents)
    if (encoded === UNSUPPORTED) {
      return UNSUPPORTED
    }
    entries.push([key, encoded])
  }
  parents.delete(value)
  return [Array.isArray(value) ? 'array' : 'record', entries]
}

/** 只读取数据描述符；getter、Proxy、状态正则等自定义行为不得在指纹阶段执行。 */
export function markTrustedJsOptions<T extends object>(options: T) {
  trustedOptionSnapshots.add(options)
  return options
}

export function getJsOptionsSignature(options: IJsHandlerOptions) {
  if (types.isProxy(options)) {
    return undefined
  }
  // 内部 Vite 工厂只生成固定字段并冻结嵌套配置，跳过重复深度枚举。
  if (trustedOptionSnapshots.has(options)) {
    return 'trusted'
  }
  // Vite 生成的 handler 选项是内部冻结快照；其嵌套数据不会再变化，
  // 可以复用深度编码结果，避免每个 chunk 重复枚举同一份配置。
  const frozen = Object.isFrozen(options)
  if (frozen && frozenOptionSignatures.has(options)) {
    return frozenOptionSignatures.get(options)
  }
  const entries: unknown[] = []
  const descriptors = Object.getOwnPropertyDescriptors(options)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === 'classNameSet') {
      continue
    }
    if (typeof key !== 'string' || !('value' in descriptors[key]!)) {
      if (frozen) {
        frozenOptionSignatures.set(options, undefined)
      }
      return undefined
    }
    const value: unknown = descriptors[key]!.value
    const encoded = key === 'moduleGraph' && value && typeof value === 'object'
      ? ['moduleGraph', getObjectId(value)]
      : encodeData(value, new Set())
    if (encoded === UNSUPPORTED) {
      if (frozen) {
        frozenOptionSignatures.set(options, undefined)
      }
      return undefined
    }
    entries.push([key, encoded])
  }
  const signature = JSON.stringify(entries)
  if (frozen) {
    frozenOptionSignatures.set(options, signature)
  }
  return signature
}

/** 自定义 has/iterator/size、子类和 Proxy 交给 Babel，避免原生集合快照吞掉用户行为。 */
export function isPlainClassNameSet(set?: Set<string>) {
  return !set || (!types.isProxy(set) && Object.getPrototypeOf(set) === Set.prototype && Reflect.ownKeys(set).length === 0)
}

/** 下游映射缓存按身份复用，因此每个配置版本使用独立且不可修改的映射快照。 */
export function snapshotJsOptions(options: IJsHandlerOptions): IJsHandlerOptions {
  return {
    ...options,
    escapeMap: options.escapeMap ? Object.freeze({ ...options.escapeMap }) : undefined,
  }
}
