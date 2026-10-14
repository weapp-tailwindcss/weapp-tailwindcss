import { spawn } from 'node:child_process'
import process from 'node:process'
import { createPnpmCommand } from './pnpm-command.mjs'
import { createPollingBuildScheduler } from './uni-e2e-watch/scheduler.mjs'
import { collectSourceSnapshot } from './uni-e2e-watch/source-snapshot.mjs'

const READY_RE = /Build complete|Watching for changes|ready in \d+/i
const useNativeWatch = process.env.UNI_E2E_WATCH_NATIVE === '1'
const uniPlatform = process.env.UNI_E2E_WATCH_PLATFORM || 'mp-weixin'
let activeBuild

function spawnPnpm(args, options = {}) {
  const { command, args: commandArgs, shell } = createPnpmCommand(args)
  return spawn(command, commandArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...options.env,
    },
    shell,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  })
}

function pipeWithReady(child, resolveReady) {
  const onData = (chunk) => {
    const text = chunk.toString()
    process.stdout.write(text)
    if (READY_RE.test(text)) {
      resolveReady()
    }
  }

  child.stdout?.on('data', onData)
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk)
  })
}

async function runBuild() {
  await new Promise((resolve, reject) => {
    const build = spawnPnpm(['run', `build:${uniPlatform}`], {
      env: {
        UNI_BUILD_STRICT: '1',
        WEAPP_TW_HMR_TIMING: '0',
        WEAPP_TW_WATCH_REGRESSION: '0',
      },
      stdio: 'inherit',
    })
    activeBuild = build
    build.on('error', reject)
    build.on('close', (code, signal) => {
      if (activeBuild === build) {
        activeBuild = undefined
      }
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`uni build failed: ${signal ?? code}`))
    })
  })
}

async function main() {
  let stopping = false
  let pollTimer

  process.stdout.write(`[uni-e2e-watch] mode=${useNativeWatch ? 'native-watch-with-build-fallback' : 'polling-build'} platform=${uniPlatform} cwd=${process.cwd()}\n`)

  let dev
  let ready = Promise.resolve()

  if (useNativeWatch) {
    let resolveReady
    ready = new Promise((resolve) => {
      resolveReady = resolve
    })
    dev = spawnPnpm(['exec', 'uni', '-p', uniPlatform])
    pipeWithReady(dev, resolveReady)
  }

  const stop = (signal = 'SIGTERM') => {
    if (stopping) {
      return
    }
    stopping = true
    if (pollTimer) {
      clearTimeout(pollTimer)
    }
    dev?.kill(signal)
    activeBuild?.kill(signal)
  }

  process.on('SIGINT', () => stop('SIGINT'))
  process.on('SIGTERM', () => stop('SIGTERM'))

  dev?.on('error', (error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`)
    process.exitCode = 1
  })

  dev?.on('close', (code, signal) => {
    if (!stopping && code !== 0) {
      process.exitCode = code ?? 1
    }
    if (signal && !stopping) {
      process.stderr.write(`uni dev exited with signal ${signal}\n`)
    }
  })

  const scheduler = createPollingBuildScheduler({
    collectSnapshot: () => collectSourceSnapshot(process.cwd()),
    runBuild,
    isStopping: () => stopping,
    onState: state => process.stdout.write(`[uni-e2e-watch:build] ${JSON.stringify(state)}\n`),
  })
  const poll = async () => {
    try {
      await scheduler.poll()
      if (!stopping) {
        pollTimer = setTimeout(() => {
          void poll()
        }, 250)
      }
    }
    catch (error) {
      process.stderr.write(`${error.stack ?? error.message}\n`)
      process.exitCode = 1
      stop()
    }
  }
  await ready
  await poll()
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
