import type { DemoE2eMemorySample, DemoE2eMemoryStepReport } from '../demo-e2e-memory'
import type { WorkflowCancellation } from './cancellation'
import type { WorkflowProcessObserver } from './process-observer'
import type { WorkflowStep } from './quality-steps'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { sampleProcessTreeAsync, summarizeMemorySamples } from '../demo-e2e-memory'
import { formatWorkflowError, runWithCleanup } from '../e2e-preflight/cleanup'
import { createPnpmCommand } from '../pnpm-command.mjs'
import { containsWorkflowError, createWorkflowCancellation, WorkflowCancellationError } from './cancellation'
import { prepareWorkflowProcessObserver } from './process-observer'
import { createWorkflowProcessTree } from './process-tree'

export async function runStep(step: WorkflowStep, index: number, total: number, preflightEnv: Record<string, string> = {}, workflowEnv = process.env, cancellation?: AbortSignal) {
  const scope = createWorkflowCancellation({ signal: cancellation, listenForSignals: false })
  return await runWithCleanup(() => runManagedStep(step, index, total, preflightEnv, workflowEnv, scope), () => scope.dispose())
}

async function runManagedStep(step: WorkflowStep, index: number, total: number, preflightEnv: Record<string, string>, workflowEnv: NodeJS.ProcessEnv, cancellation: WorkflowCancellation) {
  const observer = await prepareWorkflowProcessObserver(cancellation.signal)
  let failure: unknown
  let report: DemoE2eMemoryStepReport | undefined
  try {
    // 准备完成与业务启动之间再次检查取消；基础设施耗时不计入业务阶段报告。
    cancellation.signal.throwIfAborted()
    report = await runObservedStep(step, index, total, preflightEnv, workflowEnv, cancellation, observer)
  }
  catch (error) {
    failure = error
  }
  try {
    await observer?.close()
  }
  catch (error) {
    // 关闭仍会重抛历史查询 fatal；已由阶段保留的同一错误不代表新增回收失败。
    if (failure === undefined || !containsWorkflowError(failure, error)) {
      const errors = [...new Set([failure, error].filter(item => item !== undefined))]
      const detail = errors.map(item => item instanceof Error ? item.message : String(item)).join('\n')
      const combined = new AggregateError(errors, `身份采集器回收失败；业务阶段不能放行。\n${detail}`, { cause: errors[0] })
      if (report) {
        report.exitCode = 1
        report.error = formatWorkflowError(error)
        Object.assign(combined, { stepReport: report })
      }
      else if (failure && typeof failure === 'object' && 'stepReport' in failure) {
        const failedReport = failure.stepReport as DemoE2eMemoryStepReport | undefined
        if (failedReport) {
          failedReport.error = [...new Set([failedReport.error, formatWorkflowError(error)].filter(Boolean))].join('\n')
        }
        Object.assign(combined, { stepReport: failure.stepReport })
      }
      failure = combined
    }
  }
  if (failure !== undefined) {
    throw failure
  }
  return report!
}

async function runObservedStep(step: WorkflowStep, index: number, total: number, preflightEnv: Record<string, string>, workflowEnv: NodeJS.ProcessEnv, cancellation: WorkflowCancellation, observer?: WorkflowProcessObserver) {
  const signal = cancellation.signal
  signal.throwIfAborted()
  process.stdout.write(`[demo-e2e] ${index}/${total}${step.local ? ' local' : ''} ${step.name}: ${step.command} ${step.args.join(' ')}\n`)
  const startedAt = Date.now()
  const samples: DemoE2eMemorySample[] = []
  const environment: NodeJS.ProcessEnv = { ...workflowEnv, ...step.env, ...preflightEnv, ...cancellation.env }
  const invocation = step.command === 'pnpm'
    ? createPnpmCommand(step.args, { npmExecPath: environment['npm_execpath'] })
    : { command: step.command, args: step.args, shell: false }
  const child = spawn(invocation.command, invocation.args, {
    cwd: process.cwd(),
    env: environment,
    detached: process.platform !== 'win32',
    shell: invocation.shell,
    stdio: 'inherit',
  })
  let spawnError: unknown
  const closed = new Promise<number>((resolve) => {
    child.once('error', (error) => {
      spawnError = error
      resolve(1)
    })
    child.once('close', code => resolve(code ?? 1))
  })
  const tree = createWorkflowProcessTree(child, closed, { observer })
  let cleanup: Promise<{ error?: unknown }> | undefined
  let recording = true
  let timer: NodeJS.Timeout | undefined
  let pendingSample: Promise<void> | undefined
  const pauseRecording = () => {
    recording = false
    clearInterval(timer)
  }
  const stop = (cooperative = false) => {
    pauseRecording()
    cleanup ??= tree.stop(cooperative).then(() => ({}), error => ({ error }))
  }
  const onExit = pauseRecording
  child.once('exit', onExit)
  let resolveCancelled!: () => void
  const cancelled = new Promise<void>((resolve) => {
    resolveCancelled = resolve
  })
  const onAbort = () => {
    stop(true)
    resolveCancelled()
  }
  signal.addEventListener('abort', onAbort, { once: true })
  let failure: unknown
  let exitCode = 1
  const record = () => {
    pendingSample ??= (async () => {
      await tree.capture()
      if (!recording) {
        return
      }
      const sample = await sampleProcessTreeAsync(child.pid, observer)
      if (sample) {
        samples.push(sample)
      }
    })().finally(() => {
      pendingSample = undefined
    })
    return pendingSample
  }
  try {
    await record()
    if (recording) {
      timer = setInterval(() => {
        if (pendingSample) {
          return
        }
        void record().catch((error) => {
          failure ??= error
          cancellation.cancel(error)
        })
      }, 1000)
      timer.unref?.()
    }
    if (signal.aborted) {
      onAbort()
    }
    const outcome = await Promise.race([closed, cancelled])
    exitCode = typeof outcome === 'number' ? outcome : 1
  }
  catch (error) {
    failure ??= error
    cancellation.cancel(error)
  }
  finally {
    clearInterval(timer)
    if (!signal.aborted && failure === undefined && child.exitCode !== null) {
      // 正常退出先让已启动的有界采集落定；不能用清理预算截断 Windows 冷启动的身份探针。
      await pendingSample?.catch((error) => {
        failure ??= error
        cancellation.cancel(error)
      })
    }
    stop(signal.aborted)
    child.removeListener('exit', onExit)
    signal.removeEventListener('abort', onAbort)
  }
  const cleanupResult = await cleanup!
  // 收尾等待最后一轮采样落定，不能让晚到的错误或样本越过阶段边界。
  await pendingSample?.catch((error) => {
    failure ??= error
  })
  const reason = signal.aborted ? signal.reason : undefined
  // 内部 fatal 同样先进入取消状态；迟到采样错误只能补充诊断，不能覆盖首因。
  const errors = [...new Set([reason, failure, spawnError, cleanupResult.error].filter(error => error !== undefined))]
  const cancelledError = reason instanceof WorkflowCancellationError ? reason : undefined
  if (cancelledError) {
    exitCode = cancelledError.exitCode
  }
  if (errors.length && exitCode === 0) {
    exitCode = 1
  }
  const report: DemoE2eMemoryStepReport = {
    name: step.name,
    command: [step.command, ...step.args],
    exitCode,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    local: step.local === true,
    summary: summarizeMemorySamples(samples),
    samples,
    ...(cancelledError ? { cancelled: cancelledError.signal, cleanupScope: '已确认身份的本轮进程；未登记独立后代不在确认范围', sourceRestoration: 'unverified' as const } : {}),
    ...(errors.length ? { error: errors.map(formatWorkflowError).join('\n') } : {}),
  }
  process.stdout.write(`[demo-e2e] ${step.name} memory: peakRSS=${report.summary.peakRssMb}MB rssDelta=${report.summary.rssDeltaMb}MB samples=${report.summary.count}\n`)
  if (exitCode !== 0) {
    const message = `[demo-e2e] ${step.name} failed with exit=${exitCode}${cancelledError ? ` (${cancelledError.signal})` : ''}`
    const error = errors.length > 1 ? new AggregateError(errors, message, { cause: errors[0] }) : new Error(message, { cause: errors[0] })
    Object.assign(error, { stepReport: report })
    throw error
  }
  return report
}
