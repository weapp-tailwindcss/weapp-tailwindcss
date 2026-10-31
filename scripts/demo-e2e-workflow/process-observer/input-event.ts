import type { createObserverDiagnostics, ObserverRequestDiagnostic } from './diagnostics'
import { observerInputFailure, observerInputRequest } from './input'

interface InputEvent {
  event?: unknown
  pid?: unknown
  line?: unknown
  stage?: unknown
  error?: unknown
}
interface InputRequest {
  line: string
  deadline: number
  diagnostic: ObserverRequestDiagnostic
}

/** 原生输入诊断只领取本轮完全相同的原始请求，不重置进度或绝对截止。 */
export function readObserverInputEvent(message: InputEvent, pid: number | undefined, pending: ReadonlyMap<number, InputRequest>, diagnostics: ReturnType<typeof createObserverDiagnostics>) {
  if (message.event !== 'request-line-received' && message.event !== 'request-input-progress' && message.event !== 'request-input-failed') {
    return false
  }
  const request = observerInputRequest(message, pid, pending)
  if (Date.now() >= request.deadline) {
    throw new Error(`身份采集器输入诊断超过本轮绝对截止；diagnostics=${JSON.stringify(diagnostics.snapshot())}。`)
  }
  if (message.event === 'request-line-received') {
    diagnostics.input(request.diagnostic)
  }
  else if (message.event === 'request-input-progress') {
    diagnostics.inputProgress(request.diagnostic, message.stage)
  }
  else {
    const error = observerInputFailure(message)
    diagnostics.inputFailed(request.diagnostic, message.stage)
    throw new Error(`身份采集器输入初始化失败：stage=${String(message.stage)}；${error}；diagnostics=${JSON.stringify(diagnostics.snapshot())}。`)
  }
  return true
}
