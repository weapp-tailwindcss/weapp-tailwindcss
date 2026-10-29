import type { ChildProcess } from 'node:child_process'
import type { Readable } from 'node:stream'
import process from 'node:process'

export interface MemoryProbeContext {
  query: 'posix-topology' | 'posix-memory'
  rootPid: number
}

interface ProbeEvent {
  event: string
  at: number
  elapsedMs: number
  detail?: Readonly<Record<string, unknown>>
}

function streamState(stream: Readable | null | undefined) {
  return stream ? Object.freeze({
    readableEnded: stream.readableEnded,
    destroyed: stream.destroyed,
    closed: stream.closed,
  }) : null
}

/** 仅观察本次持有的句柄，不启动额外进程，也不把已发信号解释为已退出。 */
export function createMemoryProbeDiagnostics(command: string, args: string[], options: {
  expiresAt: number
  timeoutMs: number
  closeTimeoutMs: number
  context?: MemoryProbeContext
}) {
  const startedAt = Date.now()
  const started = performance.now()
  const events: ProbeEvent[] = []
  let omittedEvents = 0
  let child: ChildProcess | undefined
  const request = Object.freeze({
    command,
    args: Object.freeze([...args]),
    ownerPid: process.pid,
    startedAt,
    expiresAt: options.expiresAt,
    timeoutMs: options.timeoutMs,
    closeTimeoutMs: options.closeTimeoutMs,
    ...(options.context ? { context: Object.freeze({ ...options.context }) } : {}),
  })
  const record = (event: string, detail?: Record<string, unknown>) => {
    // 保留最初与最新各 16 条边界；大量迟到错误不能挤掉首错或实际 close。
    events.push(Object.freeze({ event, at: Date.now(), elapsedMs: performance.now() - started, ...(detail ? { detail: Object.freeze({ ...detail }) } : {}) }))
    if (events.length > 32) {
      events.splice(16, 1)
      omittedEvents++
    }
  }
  const snapshot = () => Object.freeze({
    ...request,
    pid: child?.pid ?? null,
    exitCode: child?.exitCode ?? null,
    signalCode: child?.signalCode ?? null,
    killed: child?.killed ?? false,
    stdout: streamState(child?.stdout),
    stderr: streamState(child?.stderr),
    observedAt: Date.now(),
    elapsedMs: performance.now() - started,
    omittedEvents,
    events: Object.freeze([...events]),
  })
  return {
    record,
    snapshot,
    bind(value: ChildProcess) {
      child = value
      record('spawn-returned', { pid: value.pid ?? null })
    },
  }
}

export type MemoryProbeSnapshot = ReturnType<ReturnType<typeof createMemoryProbeDiagnostics>['snapshot']>
export type MemoryProbeFailure = Error & { probeDiagnostics?: MemoryProbeSnapshot, probeClose?: MemoryProbeSnapshot }

/** 首败快照只写一次；迟到的真实 close 使用独立字段，不改写首错或通过状态。 */
export function attachMemoryProbeSnapshot(error: unknown, snapshot: MemoryProbeSnapshot, field: 'probeDiagnostics' | 'probeClose' = 'probeDiagnostics') {
  if (error instanceof Error && Object.isExtensible(error) && !Object.hasOwn(error, field)) {
    Object.defineProperty(error, field, { value: snapshot, enumerable: true })
  }
}

/** 错误日志不展开环境变量或完整堆栈；原始错误对象仍由 cause 保留。 */
export function memoryProbeErrorDetail(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: String(error).slice(0, 256) }
  }
  const system = error as NodeJS.ErrnoException
  return {
    name: error.name,
    message: error.message.slice(0, 256),
    ...(system.code ? { code: system.code } : {}),
    ...(system.syscall ? { syscall: system.syscall } : {}),
  }
}
