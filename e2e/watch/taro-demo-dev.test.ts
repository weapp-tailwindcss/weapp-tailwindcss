import type { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { demoWatchShardCases, isDemoWatchShardName } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases'
import { createWatchProcessEnv } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/environment'
import {
  createLineCollector,
  killProcessTreeOnPosix,
  killProcessTreeOnWindows,
  sleep,
  spawnPnpm,
} from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'
import { resolveCaseName, shouldRunTarget } from './hot-update/shared'
import { createTaroDevSignalCollector } from './taro-dev-signals'

const ROOT = process.cwd()
const TARGETS = [
  'taro-vite-react-tailwindcss-v4',
  'taro-vite-vue3-tailwindcss-v4',
  'taro-webpack-vue3-tailwindcss-v4',
  'taro-webpack-react-tailwindcss-v4',
] as const
const STABLE_AFTER_READY_MS = 8_000
const DEFAULT_READY_TIMEOUT_MS = 180_000
const DEFAULT_TEST_TIMEOUT_MS = 240_000

function toNumberEnv(name: string, fallback: number) {
  const value = process.env[name]
  if (!value) {
    return fallback
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function resolveTaroDevReadyTimeoutMs() {
  const watchTimeoutMs = toNumberEnv('E2E_WATCH_TIMEOUT_MS', DEFAULT_READY_TIMEOUT_MS)
  return Math.max(
    DEFAULT_READY_TIMEOUT_MS,
    toNumberEnv('E2E_TARO_DEV_READY_TIMEOUT_MS', watchTimeoutMs),
  )
}

function resolveTaroDevTestTimeoutMs() {
  return Math.max(
    DEFAULT_TEST_TIMEOUT_MS,
    resolveTaroDevReadyTimeoutMs() + STABLE_AFTER_READY_MS + 60_000,
  )
}

function isEnabledEnv(name: string) {
  const value = process.env[name]
  return value === '1' || value === 'true'
}

function isReducedWatchProfile() {
  return isEnabledEnv('E2E_WATCH_WEB_ONLY') || isEnabledEnv('E2E_WATCH_MAIN_STYLE_ONLY')
}

async function stopProcessTree(child: ReturnType<typeof spawnPnpm>) {
  const pid = child.pid
  if (pid == null) {
    child.kill('SIGTERM')
    return
  }

  if (process.platform === 'win32') {
    killProcessTreeOnWindows(pid)
    return
  }

  killProcessTreeOnPosix(pid, 'SIGTERM')
  await sleep(1500)
  if (child.exitCode == null) {
    killProcessTreeOnPosix(pid, 'SIGKILL')
  }
}

async function expectDemoDevWatchReady(project: string) {
  const readyTimeoutMs = resolveTaroDevReadyTimeoutMs()
  const cwd = `${ROOT}/demo/${project}`
  const child = spawnPnpm(['dev'], {
    cwd,
    env: createWatchProcessEnv(process.env, {
      CHOKIDAR_INTERVAL: process.env.CHOKIDAR_INTERVAL ?? '50',
      CHOKIDAR_USEPOLLING: process.env.CHOKIDAR_USEPOLLING ?? '1',
      WATCHPACK_POLLING: process.env.WATCHPACK_POLLING ?? '50',
      WATCHPACK_POLLING_INTERVAL: process.env.WATCHPACK_POLLING_INTERVAL ?? '50',
      WEAPP_TW_WATCH_REGRESSION: '1',
    }),
    detached: process.platform !== 'win32',
    stdio: 'pipe',
  })
  const logs: string[] = []
  const collect = createLineCollector('taro-dev', logs, 160, {
    quietSass: true,
  })
  let buildFailed = false
  let ready = false
  let readyAt = 0
  let sawWatchReady = false
  let lastReadyCompiledCount = 0
  let compiledCount = 0
  let closeResult:
    | { code: number | null, signal: NodeJS.Signals | null }
    | undefined

  const markReadyIfCompiledAndWatching = () => {
    if (!sawWatchReady || compiledCount === 0) {
      return
    }
    ready = true
    readyAt = Date.now()
    lastReadyCompiledCount = compiledCount
  }

  const signalCollector = createTaroDevSignalCollector((signal) => {
    buildFailed ||= signal.buildFailed
    if (signal.compiled) {
      compiledCount += 1
      markReadyIfCompiledAndWatching()
    }
    if (signal.watchReady) {
      sawWatchReady = true
      markReadyIfCompiledAndWatching()
    }
  })
  const onData = (chunk: Buffer | string, stream: 'stdout' | 'stderr') => {
    collect(chunk)
    signalCollector.push(chunk, stream)
  }

  child.stdout.on('data', chunk => onData(chunk, 'stdout'))
  child.stderr.on('data', chunk => onData(chunk, 'stderr'))
  child.on('close', (code, signal) => {
    signalCollector.flush()
    closeResult = { code, signal }
  })

  try {
    const startedAt = Date.now()
    while (Date.now() - startedAt < readyTimeoutMs) {
      if (buildFailed) {
        throw new Error(`[${project}] pnpm dev compilation failed\n${logs.join('\n')}`)
      }
      if (closeResult) {
        throw new Error(
          `[${project}] pnpm dev exited before watch ready: ${closeResult.signal ?? closeResult.code}\n${logs.join('\n')}`,
        )
      }
      if (ready) {
        break
      }
      await sleep(250)
    }

    expect(
      ready,
      `[${project}] pnpm dev should enter Taro watch mode\n${logs.join('\n')}`,
    ).toBe(true)
    expect(
      closeResult,
      `[${project}] pnpm dev should keep running after watch ready`,
    ).toBeUndefined()

    while (Date.now() - readyAt < STABLE_AFTER_READY_MS) {
      if (buildFailed) {
        throw new Error(`[${project}] pnpm dev compilation failed\n${logs.join('\n')}`)
      }
      if (closeResult) {
        throw new Error(
          `[${project}] pnpm dev exited during stable watch window: ${closeResult.signal ?? closeResult.code}\n${logs.join('\n')}`,
        )
      }
      await sleep(250)
    }

    expect(
      compiledCount,
      `[${project}] pnpm dev should not self-trigger rebuilds after the final watch ready\n${logs.join('\n')}`,
    ).toBe(lastReadyCompiledCount)
    expect(
      lastReadyCompiledCount,
      `[${project}] pnpm dev should compile before entering the final watch ready\n${logs.join('\n')}`,
    ).toBeGreaterThan(0)
  }
  finally {
    await stopProcessTree(child)
  }
}

describe('e2e watch taro demo dev entry', () => {
  const caseName = resolveCaseName()

  if (isReducedWatchProfile()) {
    it.skip('skips taro pnpm dev smoke for reduced watch profile', () => {})
    return
  }

  const targets = TARGETS.filter((project) => {
    if (caseName === 'all' || caseName === 'demo') {
      return true
    }
    if (isDemoWatchShardName(caseName)) {
      return demoWatchShardCases[caseName].includes(project)
    }
    return shouldRunTarget(caseName, project)
  })

  if (targets.length === 0) {
    it.skip('skips taro pnpm dev smoke for current E2E_WATCH_CASE filter', () => {})
    return
  }

  for (const target of targets) {
    it(`keeps ${target} pnpm dev in watch mode`, async () => {
      await expectDemoDevWatchReady(target)
    }, resolveTaroDevTestTimeoutMs())
  }
})
