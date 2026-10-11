import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { killProcessTreeOnPosix, killProcessTreeOnWindows } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'

interface WatchCommandOptions {
  command?: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
  cleanupTimeoutMs?: number
  quiet?: boolean
}

/** 先请求 runner 恢复源码并关闭自身会话，再对无响应的进程树执行强制清理。 */
export async function runWatchCommand(options: WatchCommandOptions) {
  const borrowedCancelFile = options.env['E2E_WATCH_CANCEL_FILE'] || undefined
  const controlRoot = borrowedCancelFile ? undefined : await fs.mkdtemp(path.join(os.tmpdir(), 'watch-hmr-command-'))
  const cancelFile = borrowedCancelFile ?? path.join(controlRoot!, 'cancel')
  const child = execa(options.command ?? 'pnpm', options.args, {
    cwd: options.cwd,
    env: { ...options.env, E2E_WATCH_CANCEL_FILE: cancelFile },
    extendEnv: false,
    detached: process.platform !== 'win32',
    stdio: options.quiet ? 'ignore' : 'inherit',
  })
  let timedOut = false
  let cancellationWrite: Promise<void> | undefined
  let forceTimer: ReturnType<typeof setTimeout> | undefined
  const stopTree = () => {
    if (!child.pid || child.exitCode != null || child.signalCode != null) {
      return
    }
    if (process.platform === 'win32') {
      killProcessTreeOnWindows(child.pid)
    }
    else {
      killProcessTreeOnPosix(child.pid, 'SIGKILL')
    }
  }
  const timer = setTimeout(() => {
    timedOut = true
    cancellationWrite = fs.writeFile(cancelFile, 'command timeout\n').catch(stopTree)
    forceTimer = setTimeout(stopTree, options.cleanupTimeoutMs ?? 30_000)
  }, options.timeoutMs)
  let error: unknown
  try {
    await child
  }
  catch (caught) {
    error = caught
  }
  finally {
    clearTimeout(timer)
    clearTimeout(forceTimer)
    await cancellationWrite
    if (controlRoot) {
      await fs.rm(controlRoot, { recursive: true, force: true })
    }
  }
  if (timedOut) {
    throw Object.assign(new Error(`Watch command timed out after ${options.timeoutMs} milliseconds`, { cause: error }), { timedOut: true })
  }
  if (error) {
    throw error
  }
}
