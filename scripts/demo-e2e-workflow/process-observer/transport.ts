import type { ObserverRequestDiagnostic } from './diagnostics'
import type { ObserverLaunchOptions } from './launch-environment'
import { spawn } from 'node:child_process'
import { createObserverDiagnostics } from './diagnostics'
import { observerInputRequest } from './input'
import { resolveObserverLaunchEnvironment } from './launch-environment'
import { createObserverReapWindow } from './reap-window'

export type ProcessObserverQuery = { kind: 'identity', pids?: readonly number[] } | { kind: 'memory' | 'prepare', rootPid: number, cwd: string }

export const PROCESS_OBSERVER_HOST_STARTUP_MS = 15_000
export const PROCESS_OBSERVER_PREPARE_MS = 15_000

interface PendingOperation {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  timer: ReturnType<typeof setTimeout>
  deadline: number
  signal?: AbortSignal | undefined
  abort?: () => void
}

interface PendingRequest extends PendingOperation {
  diagnostic: ObserverRequestDiagnostic
  line: string
}

/** 单个受管采集器的 JSON 行协议；任一超时使会话失效，禁止重启续借预算。 */
export function createProcessObserverTransport(command: string, args: string[], createChild = spawn, launchOptions: ObserverLaunchOptions = {}) {
  const launch = resolveObserverLaunchEnvironment(command, launchOptions)
  const child = createChild(command, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: launch.env })
  const diagnostics = createObserverDiagnostics(child.pid, launch.diagnostic)
  const pending = new Map<number, PendingRequest>()
  const reapWindow = createObserverReapWindow()
  const startupWaits = new Set<PendingOperation>()
  let hostReadyAt: number | undefined
  let sequence = 0
  let buffer = ''
  let stderr = ''
  let fatal: unknown
  let closing: Promise<void> | undefined
  let didClose = false
  let closedAt: number | undefined
  let terminationAttempted = false
  let hostStopped = false
  let resolveClosed!: (at: number) => void
  const closed = new Promise<number>((resolve) => {
    resolveClosed = resolve
  })
  const dispose = (request: PendingOperation) => {
    clearTimeout(request.timer)
    if (request.abort) {
      request.signal?.removeEventListener('abort', request.abort)
    }
  }
  const reapError = () => new Error(`身份采集器退出未确认：${command} pid=${child.pid}；禁止继续调度；diagnostics=${JSON.stringify(diagnostics.snapshot())}。`, { cause: fatal })
  const reap = async () => {
    if (didClose) {
      reapWindow.assertClosed(closedAt, reapError)
      return
    }
    await reapWindow.wait(closed, reapError)
  }
  const terminate = () => {
    if (didClose || terminationAttempted || !Number.isInteger(child.pid) || child.pid! <= 0) {
      return
    }
    terminationAttempted = true
    diagnostics.shutdown('terminate-requested')
    try {
      child.kill('SIGKILL')
    }
    catch (killError) {
      fatal = new AggregateError([fatal, killError], '身份采集器终止失败。')
    }
  }
  const fail = (error: unknown) => {
    if (fatal !== undefined) {
      return
    }
    fatal ??= error
    const requests = [...pending.values(), ...startupWaits]
    for (const request of requests) {
      dispose(request)
    }
    pending.clear()
    startupWaits.clear()
    terminate()
    closing ??= reap().catch((reapError) => {
      throw new AggregateError([fatal, reapError], '身份采集器失败且退出未确认。')
    })
    void closing.then(() => {
      for (const request of requests) {
        request.reject(fatal)
      }
    }, (reapError) => {
      for (const request of requests) {
        request.reject(reapError)
      }
    })
  }
  child.once('error', error => fail(error))
  child.stdin.once('error', error => fail(error))
  child.stdout.once('error', error => fail(error))
  child.stderr.once('error', error => fail(error))
  child.stdout.once('end', () => {
    if (buffer.length || (!closing && fatal === undefined)) {
      fail(new Error(`身份采集器响应流意外结束：${command} pid=${child.pid}。`))
    }
  })
  child.once('exit', (code, signal) => diagnostics.shutdown('exit', { code, signal }))
  child.once('close', (code, signal) => {
    diagnostics.shutdown('close', { code, signal })
    didClose = true
    closedAt = Date.now()
    resolveClosed(closedAt)
    const expectedForcedClose = closing !== undefined && hostStopped && terminationAttempted && code === null && signal === 'SIGKILL'
    if (pending.size || (!expectedForcedClose && (code !== 0 || signal !== null)) || (!closing && fatal === undefined)) {
      fail(new Error(`身份采集器意外退出：${command} pid=${child.pid} code=${code} signal=${signal} stderr=${stderr}`))
    }
  })
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-8192)
  })
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    buffer += chunk
    if (buffer.length > 8 * 1024 * 1024) {
      fail(new Error('身份采集器响应超过长度边界。'))
      return
    }
    let boundary = buffer.indexOf('\n')
    while (boundary !== -1) {
      const line = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 1)
      try {
        const message = JSON.parse(line)
        if (message?.event !== undefined) {
          if (message.event === 'request-line-received') {
            const request = observerInputRequest(message, child.pid, pending)
            if (Date.now() >= request.deadline) {
              throw new Error(`身份采集器已读行超过本轮绝对截止：${command}；diagnostics=${JSON.stringify(diagnostics.snapshot())}。`)
            }
            diagnostics.input(request.diagnostic)
            boundary = buffer.indexOf('\n')
            continue
          }
          if (message.event === 'observer-stopped') {
            if (!closing || fatal !== undefined || pending.size || startupWaits.size || hostStopped || message.pid !== child.pid || !Number.isInteger(message.pid) || hostReadyAt === undefined) {
              throw new Error('身份采集器停止诊断缺少正常关闭阶段或本体 PID，不能接受诊断行。')
            }
            hostStopped = true
            diagnostics.shutdown('observer-stopped')
            boundary = buffer.indexOf('\n')
            continue
          }
          const request = pending.get(message.id)
          if (message.event !== 'observer-ready' && (!Number.isInteger(message.id) || !request)) {
            throw new Error('身份采集器请求进度缺少本轮请求身份。')
          }
          const expired = message.event === 'observer-ready'
            ? [...pending.entries()].find(([, item]) => Date.now() >= item.deadline)
            : request && Date.now() >= request.deadline ? [message.id, request] : undefined
          if (expired) {
            throw new Error(`身份采集器进度超过本轮绝对截止：${command} id=${expired[0]}；diagnostics=${JSON.stringify(diagnostics.snapshot())}。`)
          }
          if (message.event === 'observer-ready' && [...startupWaits].some(item => Date.now() >= item.deadline)) {
            throw new Error(`身份采集器宿主握手超过本轮绝对截止：${command} pid=${child.pid}。`)
          }
          diagnostics.progress(message, request?.diagnostic)
          if (message.event === 'observer-ready') {
            hostReadyAt = Date.now()
            for (const waiter of startupWaits) {
              dispose(waiter)
              waiter.resolve(hostReadyAt)
            }
            startupWaits.clear()
          }
          boundary = buffer.indexOf('\n')
          continue
        }
        const request = pending.get(message.id)
        if (!request || !Number.isInteger(message.id)) {
          throw new Error('身份采集器响应缺少本轮请求身份。')
        }
        if (Date.now() >= request.deadline) {
          throw new Error(`身份采集器响应超过本轮绝对截止：${command} id=${message.id}。`)
        }
        pending.delete(message.id)
        dispose(request)
        diagnostics.response(request.diagnostic)
        if (typeof message.error === 'string') {
          pending.set(message.id, request)
          fail(new Error(`身份采集器查询失败：${message.error}`))
          return
        }
        request.resolve(message.rows)
      }
      catch (error) {
        fail(error)
        return
      }
      boundary = buffer.indexOf('\n')
    }
  })
  return {
    pid: child.pid,
    diagnostics: diagnostics.snapshot,
    invalidate: fail,
    constrainShutdown: reapWindow.constrain,
    assertHealthy() {
      if (fatal !== undefined || closing) {
        throw fatal ?? new Error('身份采集器已关闭，禁止继续调度。')
      }
    },
    /** 仅确认宿主已进入脚本；返回接收时刻，真实查询预热不能从 Promise 续体重新领取预算。 */
    waitUntilReady(timeoutMs: number, signal?: AbortSignal): Promise<number> {
      signal?.throwIfAborted()
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return Promise.reject(new Error('身份采集器宿主启动预算已耗尽，禁止继续调度。'))
      }
      if (fatal !== undefined || closing) {
        return Promise.reject(fatal ?? new Error('身份采集器已关闭，禁止继续调度。'))
      }
      if (hostReadyAt !== undefined) {
        return Promise.resolve(hostReadyAt)
      }
      return new Promise((resolve, reject) => {
        const waiter: PendingOperation = {
          resolve: value => resolve(value as number),
          reject,
          timer: setTimeout(() => fail(new Error(`身份采集器宿主启动超时：${command} pid=${child.pid} timeoutMs=${timeoutMs}；diagnostics=${JSON.stringify(diagnostics.snapshot())}。`)), Math.ceil(timeoutMs)),
          deadline: Date.now() + timeoutMs,
          signal,
        }
        waiter.abort = () => fail(signal?.reason ?? new Error('身份采集器宿主启动已取消。'))
        startupWaits.add(waiter)
        signal?.addEventListener('abort', waiter.abort, { once: true })
      })
    },
    request(query: ProcessObserverQuery, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
      signal?.throwIfAborted()
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return Promise.reject(new Error('身份采集器请求预算已耗尽，禁止继续调度。'))
      }
      if (fatal !== undefined || closing) {
        return Promise.reject(fatal ?? new Error('身份采集器已关闭，禁止继续调度。'))
      }
      const id = ++sequence
      const line = JSON.stringify({ ...query, id })
      return new Promise((resolve, reject) => {
        const request: PendingRequest = {
          resolve,
          reject,
          timer: setTimeout(() => fail(new Error(`身份采集器请求超时：${command} pid=${child.pid} id=${id} timeoutMs=${timeoutMs}；diagnostics=${JSON.stringify(diagnostics.snapshot())}。`)), Math.ceil(timeoutMs)),
          deadline: Date.now() + timeoutMs,
          signal,
          diagnostic: diagnostics.begin(id, query),
          line,
        }
        request.abort = () => fail(signal?.reason ?? new Error('身份采集器请求已取消。'))
        pending.set(id, request)
        signal?.addEventListener('abort', request.abort, { once: true })
        child.stdin.write(`${line}\n`, (error) => {
          if (error) {
            fail(error)
          }
          else {
            diagnostics.written(request.diagnostic)
          }
        })
      })
    },
    async close(options: { deadline?: number } = {}) {
      if (options.deadline !== undefined) {
        reapWindow.constrain(options.deadline)
      }
      if (!closing) {
        if (pending.size || startupWaits.size) {
          fail(new Error('身份采集器关闭时仍有未落定请求。'))
        }
        else {
          let eofWaitExpired = false
          closing = Promise.resolve().then(() => {
            diagnostics.shutdown('stdin-end-requested')
            child.stdin.end()
            return reap().catch((error) => {
              eofWaitExpired = true
              throw error
            })
          }).catch(async (error) => {
            // 停止协议已完成且没有查询或协议首错时，只回收仍未退出的自建宿主。
            if (!eofWaitExpired || !hostStopped || fatal !== undefined) {
              fatal ??= error
            }
            terminate()
            try {
              await reap()
            }
            catch (reapError) {
              fatal ??= error
              throw new AggregateError([fatal, reapError], '身份采集器失败且退出未确认。')
            }
            if (fatal !== undefined) {
              throw fatal
            }
          })
        }
      }
      await closing
      try {
        reapWindow.assertClosed(closedAt, reapError)
      }
      catch (error) {
        fatal ??= error
      }
      if (fatal !== undefined) {
        throw fatal
      }
    },
  }
}
