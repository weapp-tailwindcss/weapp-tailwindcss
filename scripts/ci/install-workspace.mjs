import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { createPnpmCommand } from '../pnpm-command.mjs'

export const DEFAULT_INSTALL_ATTEMPTS = 2
export const DEFAULT_INSTALL_TIMEOUT_MS = 10 * 60 * 1000
export const DEFAULT_RETRY_DELAY_MS = 10 * 1000

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function readInstallConfig(env = process.env) {
  return {
    attempts: positiveInteger(env.PNPM_INSTALL_ATTEMPTS, DEFAULT_INSTALL_ATTEMPTS),
    timeoutMs: positiveInteger(env.PNPM_INSTALL_TIMEOUT_MS, DEFAULT_INSTALL_TIMEOUT_MS),
    retryDelayMs: positiveInteger(env.PNPM_INSTALL_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS),
  }
}

function terminateProcessTree(child) {
  if (!child.pid) {
    return
  }

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    killer.unref()
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  }
  catch {
    child.kill('SIGTERM')
  }

  const forceKill = setTimeout(() => {
    try {
      process.kill(-child.pid, 'SIGKILL')
    }
    catch {
      child.kill('SIGKILL')
    }
  }, 5 * 1000)
  forceKill.unref()
}

function runInstallAttempt(timeoutMs) {
  const command = createPnpmCommand(['install', '--frozen-lockfile'])
  const child = spawn(command.command, command.args, {
    cwd: process.cwd(),
    env: process.env,
    shell: command.shell,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    windowsHide: true,
  })

  return new Promise((resolve) => {
    let settled = false
    let timeoutHandle

    const finish = (result) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeoutHandle)
      resolve(result)
    }

    timeoutHandle = setTimeout(() => {
      console.error(`pnpm install 在 ${timeoutMs}ms 内未完成，终止当前进程。`)
      terminateProcessTree(child)
      const cancellationFallback = setTimeout(() => {
        finish({ code: null, signal: 'SIGTERM', timedOut: true })
      }, 15 * 1000)
      cancellationFallback.unref()
    }, timeoutMs)

    child.once('error', error => finish({ code: null, signal: null, error }))
    child.once('exit', (code, signal) => finish({ code, signal, timedOut: false }))
  })
}

async function clearPartialInstall() {
  await rm(path.resolve('node_modules'), { recursive: true, force: true })
}

export async function installWorkspace(config = readInstallConfig()) {
  for (let attempt = 1; attempt <= config.attempts; attempt++) {
    console.log(`安装 workspace 依赖（第 ${attempt}/${config.attempts} 次，单次上限 ${config.timeoutMs}ms）。`)
    const result = await runInstallAttempt(config.timeoutMs)
    if (result.code === 0) {
      return result
    }

    const reason = result.timedOut
      ? '超时'
      : result.error?.message || `退出码 ${String(result.code)}${result.signal ? `（${result.signal}）` : ''}`
    if (attempt === config.attempts) {
      throw new Error(`pnpm install 失败：${reason}`)
    }

    if (result.timedOut) {
      await clearPartialInstall()
    }
    console.error(`pnpm install ${reason}，${config.retryDelayMs}ms 后重试。`)
    await delay(config.retryDelayMs)
  }
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  installWorkspace().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
