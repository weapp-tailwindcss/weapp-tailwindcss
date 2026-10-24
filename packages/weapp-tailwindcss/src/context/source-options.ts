import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { snapshotConfiguration } from './configuration-snapshot'

const sourceOptions = new WeakMap<object, UserDefinedOptions>()
const snapshots = new WeakSet<object>()
const internalFields = new Set(['styleHandler', 'jsHandler', 'templateHandler', 'tailwindRuntime', 'refreshTailwindcssRuntime', 'customAttributesEntities', 'escapeMap'])

/** 仅保留可复用的用户配置；外部缓存和回调继续保留调用者身份。 */
export function getCompilerContextSourceOptions(options: UserDefinedOptions = {}): UserDefinedOptions {
  if (snapshots.has(options)) {
    return options
  }
  const registered = sourceOptions.get(options)
  if (registered) {
    return registered
  }
  const entries = Object.entries(options).filter(([key]) => !internalFields.has(key) && key !== 'cache')
  const snapshot = snapshotConfiguration(Object.fromEntries(entries))
  const result = Object.freeze({ ...snapshot, ...('cache' in options ? { cache: options.cache } : {}) })
  snapshots.add(result)
  return result
}

/** 创建时登记配置来源，后续实例不会把内部 handler、runtime 或自有缓存当成用户配置。 */
export function registerCompilerContextSourceOptions(context: InternalUserDefinedOptions, options: UserDefinedOptions) {
  sourceOptions.set(context, options)
}
