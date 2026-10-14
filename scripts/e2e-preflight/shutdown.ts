export type ShutdownResult = { passed: true } | { passed: false, error: unknown }

/** 每个收尾阶段只领取一次固定预算；迟到拒绝仍由 race 的处理器观察。 */
export async function shutdownPhase(name: string, action: () => void | Promise<void>, timeoutMs: number): Promise<ShutdownResult> {
  const timeout = new Error(`预检收尾 ${name} 超过 ${timeoutMs}ms，资源回收未确认。`)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.resolve().then(action),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(reject, timeoutMs, timeout)
      }),
    ])
    return { passed: true }
  }
  catch (error) {
    return { passed: false, error }
  }
  finally {
    clearTimeout(timer)
  }
}
