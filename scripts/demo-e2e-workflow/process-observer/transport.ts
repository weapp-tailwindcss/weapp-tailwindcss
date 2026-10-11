import { spawn } from 'node:child_process'

export type ProcessObserverQuery = { kind: 'identity', pids?: readonly number[] } | { kind: 'memory', rootPid: number, cwd: string }

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  timer: ReturnType<typeof setTimeout>
  deadline: number
  signal?: AbortSignal
  abort?: () => void
}

/** 单个受管采集器的 JSON 行协议；任一超时使会话失效，禁止重启续借预算。 */
export function createProcessObserverTransport(command: string, args: string[], createChild = spawn) {
  const child = createChild(command, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  const pending = new Map<number, PendingRequest>()
  let sequence = 0
  let buffer = ''
  let stderr = ''
  let fatal: unknown
  let closing: Promise<void> | undefined
  let didClose = false
  let resolveClosed!: () => void
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve
  })
  const dispose = (request: PendingRequest) => {
    clearTimeout(request.timer)
    if (request.abort) {
      request.signal?.removeEventListener('abort', request.abort)
    }
  }
  const reap = async () => {
    if (didClose) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([closed, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`身份采集器退出未确认：${command} pid=${child.pid}；禁止继续调度。`, { cause: fatal })), 1000)
      })])
    }
    finally {
      clearTimeout(timer)
    }
  }
  const fail = (error: unknown) => {
    fatal ??= error
    for (const request of pending.values()) {
      dispose(request)
    }
    const requests = [...pending.values()]
    pending.clear()
    if (!didClose) {
      try {
        child.kill('SIGKILL')
      }
      catch (killError) {
        fatal = new AggregateError([fatal, killError], '身份采集器终止失败。')
      }
    }
    closing ??= reap()
    void closing.then(() => {
      for (const request of requests) {
        request.reject(fatal)
      }
    }, (reapError) => {
      const failure = new AggregateError([fatal, reapError], '身份采集器失败且退出未确认。')
      for (const request of requests) {
        request.reject(failure)
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
  child.once('close', (code, signal) => {
    didClose = true
    resolveClosed()
    if (pending.size || code !== 0 || signal !== null || (!closing && fatal === undefined)) {
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
        const request = pending.get(message.id)
        if (!request || !Number.isInteger(message.id)) {
          throw new Error('身份采集器响应缺少本轮请求身份。')
        }
        if (Date.now() >= request.deadline) {
          throw new Error(`身份采集器响应超过本轮绝对截止：${command} id=${message.id}。`)
        }
        pending.delete(message.id)
        dispose(request)
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
    invalidate: fail,
    assertHealthy() {
      if (fatal !== undefined || closing) {
        throw fatal ?? new Error('身份采集器已关闭，禁止继续调度。')
      }
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
      return new Promise((resolve, reject) => {
        const request: PendingRequest = {
          resolve,
          reject,
          timer: setTimeout(() => fail(new Error(`身份采集器请求超时：${command} pid=${child.pid} id=${id} timeoutMs=${timeoutMs}。`)), Math.ceil(timeoutMs)),
          deadline: Date.now() + timeoutMs,
          signal,
        }
        request.abort = () => fail(signal?.reason ?? new Error('身份采集器请求已取消。'))
        pending.set(id, request)
        signal?.addEventListener('abort', request.abort, { once: true })
        child.stdin.write(`${JSON.stringify({ ...query, id })}\n`, (error) => {
          if (error) {
            fail(error)
          }
        })
      })
    },
    async close() {
      if (!closing) {
        if (pending.size) {
          fail(new Error('身份采集器关闭时仍有未落定请求。'))
        }
        else {
          closing = Promise.resolve().then(() => {
            child.stdin.end()
            return reap()
          }).catch(async (error) => {
            fatal ??= error
            try {
              child.kill('SIGKILL')
            }
            catch (killError) {
              fatal = new AggregateError([fatal, killError], '身份采集器终止失败。')
            }
            try {
              await reap()
            }
            catch (reapError) {
              throw new AggregateError([fatal, reapError], '身份采集器失败且退出未确认。')
            }
            throw fatal
          })
        }
      }
      await closing
      if (fatal !== undefined) {
        throw fatal
      }
    },
  }
}
