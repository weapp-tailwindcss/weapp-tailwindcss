import type { PreflightSession } from './session'
import type { ProbeId } from './types'
import path from 'node:path'
import process from 'node:process'
import { formatWorkflowError, runWithCleanup } from './cleanup'
import { consumerAlive } from './lifecycle'
import { acquireLock } from './lock'
import { serve } from './server'
import { shutdownPhase } from './shutdown'
import { maxAgeMs, requiredCheckIds } from './types'

interface DaemonOptions {
  acquireLock?: typeof acquireLock
  serve?: typeof serve
  signals?: {
    on: (signal: 'SIGINT' | 'SIGTERM', listener: () => void) => unknown
    removeListener: (signal: 'SIGINT' | 'SIGTERM', listener: () => void) => unknown
  }
  interrupted?: () => void
  write?: (message: string) => void
  warn?: (message: string) => void
  shutdownPhaseMs?: number
}

/** 持有本轮预检资源，供 CLI 和不启动真实工具的生命周期回归共用。 */
export async function runPreflightDaemon(session: PreflightSession, options: DaemonOptions = {}) {
  const { report, file, dir } = session
  const signals = options.signals ?? process
  const write = options.write ?? ((message: string) => process.stdout.write(message))
  const warn = options.warn ?? ((message: string) => process.stderr.write(message))
  const timeoutMs = options.shutdownPhaseMs ?? 5000
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('预检收尾预算必须为正数。')
  }
  let release: (() => Promise<void>) | undefined
  let server: Awaited<ReturnType<typeof serve>> | undefined
  let expire: ReturnType<typeof setInterval> | undefined
  let requestStop!: () => void
  const requested = new Promise<void>((resolve) => {
    requestStop = resolve
  })
  let settleAction!: () => void
  const actionSettled = new Promise<void>((resolve) => {
    settleAction = resolve
  })
  let stopping: Promise<void> | undefined
  const stop = () => {
    if (!stopping) {
      requestStop()
      // 取消立即开始；停止请求唤醒主流程后，等资源登记和错误报告结束再统一回收。
      const cancellation = shutdownPhase('取消探针', () => session.cancel(), timeoutMs)
      stopping = (async () => {
        await actionSettled
        clearInterval(expire)
        const cancelled = await cancellation
        const errors: unknown[] = cancelled.passed ? [] : [cancelled.error]
        if (report.status !== 'finished') {
          report.status = 'blocked'
          delete report.verifiedAt
          const saved = await shutdownPhase('保存报告', () => session.save(), timeoutMs)
          if (!saved.passed) {
            errors.push(saved.error)
          }
        }
        const closed = await shutdownPhase('关闭服务', () => server?.close(), timeoutMs)
        if (!closed.passed) {
          errors.push(closed.error)
        }
        if (!cancelled.passed || !closed.passed) {
          errors.push(new Error('探针或服务停止未确认，保留本轮工具锁，禁止新一轮并发占用。'))
        }
        else {
          const released = await shutdownPhase('释放工具锁', () => release?.(), timeoutMs)
          if (!released.passed) {
            errors.push(released.error)
          }
        }
        if (errors.length) {
          throw new AggregateError(errors, '预检 daemon 收尾失败。')
        }
      })()
      // 信号和响应事件不能接收 Promise；最终 finally 始终等待并上抛同一结果。
      void stopping.catch(() => {})
    }
    return stopping
  }
  const assertRunning = () => {
    if (stopping) {
      throw new Error('预检已中断，本轮不再启动服务或探针。')
    }
  }
  const whileRunning = <T>(action: Promise<T>) => Promise.race([
    action,
    requested.then(() => {
      throw new Error('预检已中断，停止等待本轮探针并进入资源回收。')
    }),
  ])
  const interrupted = () => {
    if (options.interrupted) {
      options.interrupted()
    }
    else {
      process.exitCode = 1
    }
    stop()
  }
  signals.on('SIGINT', interrupted)
  signals.on('SIGTERM', interrupted)
  await runWithCleanup(async () => {
    try {
      release = await (options.acquireLock ?? acquireLock)(report.runId)
      assertRunning()
      server = await (options.serve ?? serve)(session)
      server.onFinish(() => {
        stop()
      })
      assertRunning()
      await whileRunning(session.save())
      assertRunning()
      write(`[preflight] 报告：${file}\n`)
      await whileRunning(session.probes(requiredCheckIds(report.extended).filter((id): id is ProbeId => id !== 'computer-use'), 'prepare'))
      assertRunning()
      if (report.checks.some(check => check.id !== 'computer-use' && check.status !== 'passed')) {
        warn(`[preflight] 环境已阻断；全面测试未启动。请查看 ${path.join(dir, 'report.md')}\n`)
        if (options.interrupted) {
          options.interrupted()
        }
        else {
          process.exitCode = 1
        }
        return
      }
      write(`[preflight] 等待当前 AI 会话的 computer use 验证，尚未放行。\n页面：${report.endpoint}/challenge/${report.challenge}\n证据：${path.join(dir, 'computer-use.json')}\n验证：pnpm e2e:preflight verify --report ${JSON.stringify(file)}\n`)
      expire = setInterval(() => {
        if (report.status === 'running' && !consumerAlive(report.consumer)) {
          report.interruption = '全面测试进程已退出，本轮失效；恢复时必须重新 prepare。'
          warn(`[preflight] ${report.interruption}\n`)
          interrupted()
        }
        else if (report.status !== 'running' && Date.now() - Date.parse(report.createdAt) > maxAgeMs) {
          warn('[preflight] 等待验证超时，本轮失效。\n')
          interrupted()
        }
      }, 1000)
      await requested
    }
    catch (error) {
      const check = report.checks.find(item => item.id === 'base')!
      Object.assign(check, { status: 'blocked', checkedAt: new Date().toISOString(), detail: formatWorkflowError(error) })
      throw error
    }
    finally {
      settleAction()
    }
  }, async () => {
    try {
      await stop()
    }
    finally {
      signals.removeListener('SIGINT', interrupted)
      signals.removeListener('SIGTERM', interrupted)
    }
  })
}
