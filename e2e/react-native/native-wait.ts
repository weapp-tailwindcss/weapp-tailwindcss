export interface NativeWaitState {
  bundleCompletedAt?: number
  now: number
  recovered: boolean
  recoveryDelay: number
  reportTimeout: number
  runCompletedAt?: number
  startedAt: number
  startupTimeout: number
  hostCaptureElapsed?: number
}

export function evaluateNativeWait(state: NativeWaitState) {
  const phase = state.runCompletedAt ? 'runtime report' : 'native build and launch'
  const phaseStartedAt = state.runCompletedAt ?? state.startedAt
  const phaseTimeout = state.runCompletedAt ? state.reportTimeout : state.startupTimeout
  const hostCaptureElapsed = state.runCompletedAt ? state.hostCaptureElapsed ?? 0 : 0
  const phaseElapsed = state.now - phaseStartedAt - hostCaptureElapsed
  const phaseTimedOut = phaseElapsed >= phaseTimeout
  const shouldRecover = Boolean(
    state.runCompletedAt
    && !state.recovered
    && (
      (!state.bundleCompletedAt && phaseElapsed >= state.recoveryDelay)
      || phaseTimedOut
    ),
  )
  return {
    phase,
    shouldRecover,
    timedOut: phaseTimedOut,
  }
}
/** 首屏报告不能绕过仍未完成或已失败的启动命令；核对完成后才进入截图和 HMR。 */
export function canAcceptNativeReport(exitCode: number | null | undefined, reconciled: boolean, requireCompletion: boolean) {
  if (typeof exitCode === 'number') {
    return exitCode === 0 || reconciled
  }
  return !requireCompletion
}
/** 子进程已退出仍可能等待继承的输出管道，收尾也必须占用既有启动预算。 */
export async function awaitNativeExitCompletion(completion: PromiseLike<unknown>, remaining: number) {
  if (remaining <= 0) {
    throw new Error('原生启动等待输出关闭的预算已耗尽')
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      completion,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('原生启动等待输出关闭超时')), remaining)
      }),
    ])
  }
  finally {
    clearTimeout(timer)
  }
}
