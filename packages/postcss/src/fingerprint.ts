import type { IStyleHandlerOptions } from './types'

interface FingerprintState {
  map: WeakMap<object, string>
  counter: number
}

// 函数身份必须跨调用稳定；弱引用避免缓存指纹持有已释放的插件闭包。
const functionIds = new WeakMap<object, number>()
let nextFunctionId = 0

export function fingerprintOptions(
  value: unknown,
  state: FingerprintState = { map: new WeakMap<object, string>(), counter: 0 },
): string {
  if (value === null || value === undefined) {
    return String(value)
  }

  if (typeof value === 'function') {
    let id = functionIds.get(value)
    if (id === undefined) {
      id = nextFunctionId++
      functionIds.set(value, id)
    }
    return `fn:${id}`
  }
  if (typeof value === 'symbol') {
    return `sym:${String(value)}`
  }
  if (typeof value !== 'object') {
    return `${typeof value}:${JSON.stringify(String(value))}`
  }

  const objectValue = value as Record<string, unknown>
  const cached = state.map.get(objectValue)
  if (cached) {
    return cached
  }

  const marker = `ref:${state.counter++}`
  state.map.set(objectValue, marker)

  if (Array.isArray(objectValue)) {
    const parts = objectValue.map(entry => fingerprintOptions(entry, state))
    return `[${parts.join(',')}]`
  }

  if (objectValue instanceof RegExp) {
    return `regexp:${objectValue.source}/${objectValue.flags}`
  }

  if (objectValue instanceof Map) {
    const entries = [...objectValue.entries()]
      .map(([key, entry]) => [fingerprintOptions(key, state), fingerprintOptions(entry, state)] as const)
      .sort(([left], [right]) => left.localeCompare(right))
    return `map:{${entries.map(([key, entry]) => `${key}:${entry}`).join(',')}}@${marker}`
  }

  const keys = Object.keys(objectValue).sort()
  const parts = keys.map(key => `${JSON.stringify(key)}:${fingerprintOptions(objectValue[key], state)}`)
  return `{${parts.join(',')}}@${marker}`
}

/** 处理器运行时状态不参与输入签名，其余选项每次按实际内容计算。 */
export function fingerprintStyleOptions(options: Partial<IStyleHandlerOptions>) {
  const { ctx: _ctx, ...inputs } = options
  return fingerprintOptions(inputs)
}
