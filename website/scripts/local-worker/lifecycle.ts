import type { HBuilderXCommandOptions, SpawnedHBuilderXCommand } from '../../../packages/hbuilderx-runner/src/types'
import type { WorkflowProcessObserver } from '../../../scripts/demo-e2e-workflow/process-observer'
import type { ProcessIdentity } from '../../../scripts/demo-e2e-workflow/process-table'
import type { LocalCommandGate } from './launch-gate'
import process from 'node:process'
import { spawnCommand } from '../../../packages/hbuilderx-runner/src/process'
import { includeWorkflowCancellation, observeWorkflowCancellation } from '../../../scripts/demo-e2e-workflow/cancellation'
import { prepareWorkflowProcessObserver } from '../../../scripts/demo-e2e-workflow/process-observer'
import { createProcessScanScope, readPosixProcessScope } from '../../../scripts/demo-e2e-workflow/process-scope'
import { readProcessSubset } from '../../../scripts/demo-e2e-workflow/process-table'
import { createWorkflowProcessTree } from '../../../scripts/demo-e2e-workflow/process-tree'
import { runWithCleanup } from '../../../scripts/e2e-preflight/cleanup'
import { prepareLocalCommandGate } from './launch-gate'

async function runOwnedCommand<T>(command: SpawnedHBuilderXCommand, signal: AbortSignal, observer: WorkflowProcessObserver | undefined, gate: LocalCommandGate, action: (command: SpawnedHBuilderXCommand, signal: AbortSignal) => Promise<T>, onSpawn?: (command: SpawnedHBuilderXCommand, isStopping: () => boolean) => void) {
  const controller = new AbortController()
  const managedSignal = AbortSignal.any([signal, controller.signal])
  let stopping = false
  let exited = false
  let stopPromise: Promise<void> | undefined
  let timer: NodeJS.Timeout | undefined
  let pendingCapture: Promise<Map<number, ProcessIdentity>> | undefined
  let waitingForGate = gate !== undefined
  let knownPids = command.child.pid ? [command.child.pid] : []
  const runProbeScan = createProcessScanScope()
  const readTable = (timeoutMs: number, signal?: AbortSignal) => {
    if (waitingForGate) {
      // 用户 preload/CLI 尚未执行，启动握手只需登记本次 spawn 的根身份。
      const pids = command.child.pid ? [command.child.pid] : []
      return observer ? observer.subset(pids, timeoutMs, signal) : runProbeScan(owner => readProcessSubset(undefined, pids, timeoutMs, signal, undefined, owner))
    }
    if (observer) {
      return observer.table(timeoutMs, signal)
    }
    const deadline = Date.now() + timeoutMs
    return runProbeScan(owner => readPosixProcessScope({ rootPid: command.child.pid!, knownPids, group: command.child.pid! }, () => deadline, signal, owner)).then((rows) => {
      // 这里只更新发现入口，真正归属仍由 tracker 的出生身份匹配决定。
      knownPids = rows.map(row => row.pid)
      return rows
    })
  }
  // 根退出后仍从活着的身份锚扩展独立组后代，不按历史 PPID 领取归属。
  const tree = createWorkflowProcessTree(command.child, command.closed, {
    observer: {
      table: readTable,
      subset: (pids, timeoutMs, signal) => {
        knownPids = [...pids]
        return readTable(timeoutMs, signal)
      },
    },
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
  const capture = (deadline?: number) => {
    pendingCapture ??= tree.capture(deadline).then((owned) => {
      // 正常周期以 tracker 实际领取的身份收窄下一轮发现入口。
      knownPids = [...owned.keys()]
      return owned
    }).catch((error) => {
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
      const owned = await capture(gate?.deadline)
      managedSignal.throwIfAborted()
      if (!owned.has(command.child.pid!)) {
        throw new Error(`${process.platform === 'win32' ? 'Windows' : 'POSIX'} 本地命令 pid=${command.child.pid ?? 'unknown'} 的启动身份未确认：根进程已退出或首次采集缺失，不能确认后代归属。`)
      }
      gate?.release()
      waitingForGate = false
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
  const inherited = observeWorkflowCancellation({ ...process.env, ...options.env })
  const managedSignal = AbortSignal.any([signal, inherited.signal])
  let observer: WorkflowProcessObserver | undefined
  let gate: LocalCommandGate
  try {
    const result = await runWithCleanup(async () => {
      if (process.platform === 'win32') {
        observer = await prepareWorkflowProcessObserver(managedSignal)
        if (!observer) {
          throw new Error('Windows 身份观察器未准备，禁止启动本地命令。')
        }
      }
      gate = await prepareLocalCommandGate(options)
      managedSignal.throwIfAborted()
      const command = spawnCommand({ ...(gate?.options ?? options), detached: process.platform !== 'win32' })
      return await runOwnedCommand(command, managedSignal, observer, gate, action, onSpawn)
    }, async () => runWithCleanup(async () => observer?.close(), async () => gate?.close()))
    managedSignal.throwIfAborted()
    return result
  }
  catch (error) {
    throw includeWorkflowCancellation(error, managedSignal)
  }
  finally {
    inherited.dispose()
  }
}
