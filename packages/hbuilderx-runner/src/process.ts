import type { ChildProcess } from 'node:child_process'
import type { CommandExit, HBuilderXCommandOptions, HBuilderXCommandResult, SpawnedHBuilderXCommand } from './types'
import process from 'node:process'
import spawn from 'cross-spawn'
import { classifyHBuilderXOutput, collectProcessOutput, createTimeoutIssue, formatRecentLogs } from './logs'
import { registerProcessGroup, signalProcessTree, stopProcessTree } from './process/termination'

export class HBuilderXCommandError extends Error {
  readonly result: HBuilderXCommandResult
  readonly cleanupError?: Error

  constructor(message: string, result: HBuilderXCommandResult, cleanupError?: Error) {
    super(message, cleanupError ? { cause: cleanupError } : undefined)
    this.name = 'HBuilderXCommandError'
    this.result = result
    if (cleanupError) {
      this.cleanupError = cleanupError
    }
  }
}

/** 保留同步请求终止的兼容入口；需要确认关闭时必须等待 spawned.stop()。 */
export function killProcessTree(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM') {
  try {
    signalProcessTree(child, signal)
  }
  catch {
    // 旧接口不抛错；受管 stop 使用严格路径并保留终止失败原因。
  }
}

function createCommandResult(options: HBuilderXCommandOptions, exit: CommandExit, logs: string[], timedOut = false): HBuilderXCommandResult {
  const output = formatRecentLogs(logs)
  return {
    command: options.command,
    args: options.args,
    cwd: options.cwd,
    exit,
    logs,
    output,
    issue: timedOut ? createTimeoutIssue() : classifyHBuilderXOutput(output),
  }
}

function buildCommandError(prefix: string, options: HBuilderXCommandOptions, exit: CommandExit, logs: string[], timedOut = false, cleanupError?: Error) {
  const result = createCommandResult(options, exit, logs, timedOut)
  if (cleanupError && !timedOut) {
    result.issue = { kind: 'process-exit', message: '子进程清理失败，未确认关闭或进程树终止。' }
  }
  return new HBuilderXCommandError([
    `${prefix}: ${options.command} ${options.args.join(' ')}`,
    `cwd=${options.cwd}`,
    `exit=${exit.signal ?? exit.code}`,
    `issue=${result.issue.kind}: ${result.issue.message}`,
    result.issue.hint ? `hint=${result.issue.hint}` : '',
    result.output,
    cleanupError ? `cleanup=${cleanupError.message}` : '',
  ].filter(Boolean).join('\n'), result, cleanupError)
}

export function spawnCommand(options: HBuilderXCommandOptions): SpawnedHBuilderXCommand {
  const detached = options.detached ?? process.platform !== 'win32'
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    detached,
    stdio: options.stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...options.env,
      NODE_OPTIONS: options.env?.['NODE_OPTIONS'] ?? process.env['NODE_OPTIONS'] ?? '--max-old-space-size=8192',
    },
  })
  registerProcessGroup(child, detached)
  const logs = options.stdio === 'inherit' ? [] : collectProcessOutput(child)
  // 启动失败也走 close/结果分类，避免 error 事件使调用方进程直接退出。
  child.on('error', error => logs.push(`${error.message}\n`))
  let exit: CommandExit | undefined
  let stopping: Promise<void> | undefined
  const closed = new Promise<CommandExit>((resolve) => {
    child.once('close', (code, signal) => {
      exit = { code, signal }
      resolve(exit)
    })
  })
  return {
    child,
    logs,
    command: options.command,
    args: options.args,
    cwd: options.cwd,
    closed,
    ensureRunning() {
      if (exit && exit.code !== 0) {
        throw buildCommandError('命令提前退出', options, exit, logs)
      }
    },
    stop(signal: NodeJS.Signals = 'SIGTERM') {
      if (stopping) {
        return stopping
      }
      if (exit) {
        return Promise.resolve()
      }
      stopping = stopProcessTree(child, closed, signal).catch((error: Error) => {
        throw buildCommandError('命令清理失败', options, { code: child.exitCode, signal: child.signalCode }, logs, false, error)
      })
      return stopping
    },
  }
}

export async function runCommand(options: HBuilderXCommandOptions): Promise<HBuilderXCommandResult> {
  const spawned = spawnCommand(options)
  let timer: NodeJS.Timeout | undefined
  let timedOut = false
  try {
    const deadline = Symbol('deadline')
    const timeout = options.timeoutMs == null
      ? spawned.closed
      : Promise.race([
          spawned.closed,
          new Promise<typeof deadline>((resolve) => {
            timer = setTimeout(() => {
              timedOut = true
              resolve(deadline)
            }, options.timeoutMs)
          }),
        ])
    const outcome = await timeout
    if (outcome === deadline) {
      try {
        await spawned.stop()
      }
      catch (error) {
        const cleanupError = error instanceof HBuilderXCommandError ? error.cleanupError ?? error : error as Error
        throw buildCommandError('命令超时且清理失败', options, { code: spawned.child.exitCode, signal: spawned.child.signalCode }, spawned.logs, true, cleanupError)
      }
    }
    const exit = outcome === deadline ? await spawned.closed : outcome
    const result = createCommandResult(options, exit, spawned.logs, timedOut)
    if ((!timedOut && exit.code === 0) || options.allowFailure) {
      return result
    }
    const prefix = timedOut ? '命令超时' : '命令失败'
    throw buildCommandError(prefix, options, exit, spawned.logs, timedOut)
  }
  finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

export function createProcessExitTracker(child: ChildProcess) {
  let exit: CommandExit | undefined
  const closed = new Promise<CommandExit>((resolve) => {
    child.on('close', (code, signal) => {
      exit = { code, signal }
      resolve(exit)
    })
  })
  return {
    closed,
    ensureRunning(logs: string[]) {
      if (exit && exit.code !== 0) {
        const result = createCommandResult({ command: 'hbuilderx', args: ['launch'], cwd: process.cwd() }, exit, logs)
        throw new HBuilderXCommandError(`HBuilderX launch 提前退出\nissue=${result.issue.kind}: ${result.issue.message}\n${result.output}`, result)
      }
    },
  }
}
