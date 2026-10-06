import type { DemoE2eMemorySample, DemoE2eMemoryStepReport } from '../demo-e2e-memory'
import type { WorkflowStep } from './quality-steps'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { sampleProcessTreeAsync, summarizeMemorySamples } from '../demo-e2e-memory'
import { formatWorkflowError } from '../e2e-preflight/cleanup'
import { WorkflowCancellationError } from './cancellation'
import { createWorkflowProcessTree } from './process-tree'

export async function runStep(step: WorkflowStep, index: number, total: number, preflightEnv: Record<string, string> = {}, workflowEnv = process.env, cancellation?: AbortSignal) {
  cancellation?.throwIfAborted()
  process.stdout.write(`[demo-e2e] ${index}/${total}${step.local ? ' local' : ''} ${step.name}: ${step.command} ${step.args.join(' ')}\n`)
  const startedAt = Date.now()
  const samples: DemoE2eMemorySample[] = []
  const child = spawn(step.command, step.args, {
    cwd: process.cwd(),
    env: { ...workflowEnv, ...step.env, ...preflightEnv },
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32',
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
  const tree = createWorkflowProcessTree(child, closed)
  let cleanup: Promise<{ error?: unknown }> | undefined
  let recording = true
  let timer: NodeJS.Timeout | undefined
  let pendingSample: Promise<void> | undefined
  const stop = (cooperative = false) => {
    recording = false
    clearInterval(timer)
    cleanup ??= tree.stop(cooperative).then(() => ({}), error => ({ error }))
  }
  const onExit = () => stop()
  child.once('exit', onExit)
  let resolveCancelled!: () => void
  const cancelled = new Promise<void>((resolve) => {
    resolveCancelled = resolve
  })
  const onAbort = () => {
    stop(true)
    resolveCancelled()
  }
  cancellation?.addEventListener('abort', onAbort, { once: true })
  let failure: unknown
  let exitCode = 1
  const record = () => {
    pendingSample ??= (async () => {
      await tree.capture()
      if (!recording) {
        return
      }
      const sample = await sampleProcessTreeAsync(child.pid)
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
          failure = error
          stop()
          resolveCancelled()
        })
      }, 1000)
      timer.unref?.()
    }
    if (cancellation?.aborted) {
      onAbort()
    }
    const outcome = await Promise.race([closed, cancelled])
    exitCode = typeof outcome === 'number' ? outcome : 1
  }
  catch (error) {
    failure = error
  }
  finally {
    clearInterval(timer)
    stop()
    child.removeListener('exit', onExit)
    cancellation?.removeEventListener('abort', onAbort)
  }
  const cleanupResult = await cleanup!
  // 收尾等待最后一轮采样落定，不能让晚到的错误或样本越过阶段边界。
  await pendingSample?.catch((error) => {
    failure ??= error
  })
  const reason = cancellation?.aborted ? cancellation.reason : undefined
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
