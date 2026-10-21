export const nativeEvidenceFailureCodes = ['bridge-unavailable', 'geometry-unavailable', 'view-expired', 'receipt-timeout'] as const
export type NativeEvidenceFailureCode = typeof nativeEvidenceFailureCodes[number]

export interface NativeEvidenceFailure {
  version: 1
  source: 'lynx-native-evidence'
  category: 'environment'
  code: NativeEvidenceFailureCode
  message: string
}

export interface NativeBridgeFailure {
  error: NativeEvidenceFailure
}

export type NativeBridgeResult<T> = T | NativeBridgeFailure

/** 只认宿主协议的明确错误码，不从缺节点或几何断言文本推导环境故障。 */
export function readNativeEvidenceFailure(value: unknown): NativeEvidenceFailure | undefined {
  if (!value || typeof value !== 'object') {
    return
  }
  const failure = value as Partial<NativeEvidenceFailure>
  if (failure.version === 1 && failure.source === 'lynx-native-evidence' && failure.category === 'environment'
    && nativeEvidenceFailureCodes.includes(failure.code as NativeEvidenceFailureCode) && typeof failure.message === 'string' && failure.message.trim()) {
    return failure as NativeEvidenceFailure
  }
}

export class NativeEvidenceUnavailableError extends Error {
  constructor(readonly code: NativeEvidenceFailureCode, message: string) {
    super(message)
    this.name = 'NativeEvidenceUnavailableError'
  }

  toFailure(): NativeEvidenceFailure {
    return { version: 1, source: 'lynx-native-evidence', category: 'environment', code: this.code, message: this.message }
  }
}

/** 恢复错误可被聚合；遍历有限的因果链并保留原始的取证中断。 */
export function nativeEvidenceFailureIn(error: unknown, seen = new Set<unknown>()): NativeEvidenceFailure | undefined {
  if (!(error instanceof Error) || seen.has(error) || seen.size >= 32) {
    return
  }
  seen.add(error)
  if (error instanceof NativeEvidenceUnavailableError) {
    return readNativeEvidenceFailure(error.toFailure())
  }
  const children: unknown[] = []
  try {
    if (error instanceof AggregateError && Array.isArray(error.errors)) {
      children.push(...error.errors.slice(0, 32))
    }
  }
  catch {
    // 不可读取的分支不能隐藏其他兄弟错误中的明确环境协议。
  }
  try {
    children.push(error.cause)
  }
  catch {
    // 完整诊断树另行登记此分支不可读取，不能据此猜测环境类别。
  }
  for (const nested of children) {
    const failure = nativeEvidenceFailureIn(nested, seen)
    if (failure) {
      return failure
    }
  }
}

export function requestNativeReceipt<T>(invoke: (callback: (value: NativeBridgeResult<T>) => void) => void, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new NativeEvidenceUnavailableError('receipt-timeout', '原生 evidence 写入回执超时')), timeoutMs)
    try {
      invoke((value) => {
        clearTimeout(timer)
        const failure = value && typeof value === 'object' && 'error' in value ? readNativeEvidenceFailure(value.error) : undefined
        if (failure) {
          reject(new NativeEvidenceUnavailableError(failure.code, failure.message))
        }
        else {
          resolve(value as T)
        }
      })
    }
    catch (error) {
      clearTimeout(timer)
      reject(error)
    }
  })
}
