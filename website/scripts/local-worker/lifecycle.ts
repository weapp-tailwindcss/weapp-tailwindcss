import type { HBuilderXCommandOptions, SpawnedHBuilderXCommand } from '../../../packages/hbuilderx-runner/src/types'
import type { WorkflowProcessObserver } from '../../../scripts/demo-e2e-workflow/process-observer'
import type { ProcessIdentity } from '../../../scripts/demo-e2e-workflow/process-table'
import process from 'node:process'
import { spawnCommand } from '../../../packages/hbuilderx-runner/src/process'
import { includeWorkflowCancellation } from '../../../scripts/demo-e2e-workflow/cancellation'
import { prepareWorkflowProcessObserver } from '../../../scripts/demo-e2e-workflow/process-observer'
import { readProcessTable } from '../../../scripts/demo-e2e-workflow/process-table'
import { createWorkflowProcessTree } from '../../../scripts/demo-e2e-workflow/process-tree'
import { runWithCleanup } from '../../../scripts/e2e-preflight/cleanup'

async function runOwnedCommand<T>(command: SpawnedHBuilderXCommand, signal: AbortSignal, observer: WorkflowProcessObserver | undefined, action: (command: SpawnedHBuilderXCommand, signal: AbortSignal) => Promise<T>, onSpawn?: (command: SpawnedHBuilderXCommand, isStopping: () => boolean) => void) {
  const controller = new AbortController()
  const managedSignal = AbortSignal.any([signal, controller.signal])
  let stopping = false
  let exited = false
  let stopPromise: Promise<void> | undefined
  let timer: NodeJS.Timeout | undefined
  let pendingCapture: Promise<Map<number, ProcessIdentity>> | undefined
  const readTable = observer ? observer.table : readProcessTable
  // 根退出后仍从活着的身份锚扩展独立组后代，不按历史 PPID 领取归属。
  const tree = createWorkflowProcessTree(command.child, command.closed, {
    observer: { table: readTable, subset: (_pids, timeoutMs, signal) => readTable(timeoutMs, signal) },
    cooperativeMs: 1000,
    cleanupMs: 10_000,
  })
  const beginStop = () => {
    if (!stopPromise) {
      try {
        stopPromise = command.stop()
      }
      catch (error) {
        stopPromise = Promise.reject(error)
      }
      // exit 回调只领取清理句柄；作用域收尾仍等待原 Promise 并保留失败。
      void stopPromise.catch(() => {})
    }
    return stopPromise
  }
  const onExit = () => {
    exited = true
    if (!observer) {
      // close 会撤销组归属，必须在同一 exit 回调内同步启动清理。
      beginStop()
    }
  }
  command.child.once('exit', onExit)
  const capture = () => {
    pendingCapture ??= tree.capture().catch((error) => {
      controller.abort(error)
      throw error
    }).finally(() => {
      pendingCapture = undefined
    })
    void pendingCapture.catch(() => {})
    return pendingCapture
  }
  const observe = () => {
    if (stopping || managedSignal.aborted) {
      return
    }
    timer = setTimeout(() => {
      void capture().then(observe, () => {})
    }, 100)
  }
  const cleanup = async () => {
    stopping = true
    clearTimeout(timer)
    const errors: unknown[] = []
    const collect = async (action: () => Promise<unknown>) => {
      try {
        await action()
      }
      catch (error) {
        if (!errors.includes(error)) {
          errors.push(error)
        }
      }
    }
    if (pendingCapture) {
      await collect(() => pendingCapture!)
    }
    if (!exited && command.child.exitCode === null && command.child.signalCode === null) {
      // 主动停止前最后核对后代身份，再在根仍存活时启动 taskkill /t。
      await collect(capture)
    }
    await collect(beginStop)
    // 根组 stop 不能证明独立组后代消失；强制回收已登记的残留仍保留失败。
    await collect(() => tree.stop(true))
    if (errors.length === 1) {
      throw errors[0]
    }
    if (errors.length) {
      throw new AggregateError(errors, '网站本地命令清理失败，已登记后代退出未确认。')
    }
  }
  try {
    const result = await runWithCleanup(async () => {
      onSpawn?.(command, () => stopping)
      const owned = await capture()
      managedSignal.throwIfAborted()
      if (!owned.has(command.child.pid!) || exited || command.child.exitCode !== null || command.child.signalCode !== null) {
        throw new Error(`${process.platform === 'win32' ? 'Windows' : 'POSIX'} 本地命令 pid=${command.child.pid ?? 'unknown'} 的启动身份未确认：根进程已退出或首次采集缺失，不能确认后代归属。`)
      }
      observe()
      managedSignal.throwIfAborted()
      const result = await action(command, managedSignal)
      managedSignal.throwIfAborted()
      return result
    }, cleanup)
    managedSignal.throwIfAborted()
    return result
  }
  catch (error) {
    throw includeWorkflowCancellation(error, managedSignal)
  }
  finally {
    command.child.removeListener('exit', onExit)
    clearTimeout(timer)
  }
}

/** 观察已登记的出生身份并持有 POSIX 独立组；未登记且失去活锚的孤儿不在快照确认范围。 */
export async function withLocalCommand<T>(options: HBuilderXCommandOptions, signal: AbortSignal, action: (command: SpawnedHBuilderXCommand, signal: AbortSignal) => Promise<T>, onSpawn?: (command: SpawnedHBuilderXCommand, isStopping: () => boolean) => void): Promise<T> {
  signal.throwIfAborted()
  let observer: WorkflowProcessObserver | undefined
  try {
    const result = await runWithCleanup(async () => {
      if (process.platform === 'win32') {
        observer = await prepareWorkflowProcessObserver(signal)
        if (!observer) {
          throw new Error('Windows 身份观察器未准备，禁止启动本地命令。')
        }
      }
      signal.throwIfAborted()
      const command = spawnCommand({ ...options, detached: process.platform !== 'win32' })
      return await runOwnedCommand(command, signal, observer, action, onSpawn)
    }, async () => observer?.close())
    signal.throwIfAborted()
    return result
  }
  catch (error) {
    throw includeWorkflowCancellation(error, signal)
  }
}
