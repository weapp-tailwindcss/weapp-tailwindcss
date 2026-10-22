/** 新夹具的单步有限预算；失败后仍执行各自独立的清理。 */
export async function bounded<T>(label: string, operation: () => Promise<T>, timeoutMs = 5_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([Promise.resolve().then(operation), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} 超过 ${timeoutMs}ms 预算`)), timeoutMs)
    })])
  }
  finally {
    clearTimeout(timer)
  }
}
