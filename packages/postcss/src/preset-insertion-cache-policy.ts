import type { PresetEnvOptions } from './preset-env-options'

interface InsertionCacheState {
  present: boolean
  key: string | undefined
}

const pluginIds = new WeakMap<object, number>()
let nextPluginId = 0

function identity(value: object): number {
  let id = pluginIds.get(value)
  if (id === undefined) {
    id = nextPluginId++
    pluginIds.set(value, id)
  }
  return id
}

function insertionValue(value: unknown, seen: Set<object>): unknown[] | undefined {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
    return []
  }
  if (seen.has(value)) {
    return undefined
  }
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) {
        return undefined
      }
      const entries: unknown[] = []
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, index)
        if (!descriptor || !('value' in descriptor)) {
          return undefined
        }
        const nested = insertionValue(descriptor.value, seen)
        if (nested === undefined) {
          return undefined
        }
        entries.push(nested)
      }
      return entries
    }
    const entries: unknown[] = [identity(value)]
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if (!('value' in descriptor)) {
        return undefined
      }
    }
    // 插件包中的子插件也参与身份；不把 map 或数组外壳当成插件。
    for (let current: object | null = value; current !== null; current = Object.getPrototypeOf(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, 'plugins')
      if (descriptor) {
        if (!('value' in descriptor)) {
          return undefined
        }
        const nested = insertionValue(descriptor.value, seen)
        if (nested === undefined) {
          return undefined
        }
        entries.push(nested)
        break
      }
      const prepare = Object.getOwnPropertyDescriptor(current, 'prepare')
      if (prepare && !('value' in prepare)) {
        return undefined
      }
    }
    return entries
  }
  finally {
    seen.delete(value)
  }
}

/** 插入扩展按实际插件身份区分；访问器不提前求值，也不取得配置或管线缓存资格。 */
export function getPresetInsertionCacheState(options?: PresetEnvOptions): InsertionCacheState {
  if (options == null) {
    return { present: false, key: '' }
  }
  let present = false
  const entries: unknown[] = []
  try {
    for (const position of ['insertBefore', 'insertAfter'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(options, position)
      if (!descriptor) {
        if (position in options) {
          return { present: true, key: undefined }
        }
        continue
      }
      if (!('value' in descriptor)) {
        return { present: true, key: undefined }
      }
      const map: unknown = descriptor.value
      if (map == null) {
        continue
      }
      if (typeof map !== 'object' || Array.isArray(map)) {
        return { present: true, key: undefined }
      }
      for (const name of Object.keys(map).sort()) {
        present = true
        const item = Object.getOwnPropertyDescriptor(map, name)
        if (!item || !('value' in item)) {
          return { present: true, key: undefined }
        }
        const plugins = insertionValue(item.value, new Set())
        if (plugins === undefined) {
          return { present: true, key: undefined }
        }
        entries.push([position, name, plugins])
      }
    }
    return { present, key: present ? JSON.stringify(entries) : '' }
  }
  catch {
    return { present: true, key: undefined }
  }
}
