export async function waitFor(check, timeoutMs, intervalMs = 120) {
  const deadline = performance.now() + Math.max(0, timeoutMs)
  // 已完成的写入可能耗尽预算，仍需观察当前状态；预算仅限制后续等待。
  do {
    if (await check()) {
      return true
    }
    const remainingMs = deadline - performance.now()
    if (remainingMs <= 0) {
      return false
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, remainingMs)))
  } while (performance.now() < deadline)
  return false
}
