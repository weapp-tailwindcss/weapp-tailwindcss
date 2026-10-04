import type { WorkerOptions } from './types'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { finished } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

export async function runWorker(options: WorkerOptions) {
  const require = createRequire(path.join(options.root, 'package.json'))
  const worker = fileURLToPath(new URL('worker.ts', import.meta.url))
  const log = createWriteStream(`${options.output}.log`)
  const child = spawn(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href, worker, JSON.stringify(options)], {
    cwd: path.join(options.root, 'demo', 'web', 'vue-vite-tailwindcss-v4'),
    env: { ...process.env, WEAPP_TW_TARGET: options.target, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', chunk => log.write(chunk))
  child.stderr.on('data', chunk => log.write(chunk))
  let timedOut = false
  let signalled = false
  let forceTimer: NodeJS.Timeout | undefined
  function terminate() {
    child.kill('SIGTERM')
    forceTimer ??= setTimeout(() => child.kill('SIGKILL'), 10_000)
  }
  const stop = () => {
    signalled = true
    terminate()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  const timer = setTimeout(() => {
    timedOut = true
    terminate()
  }, Math.max(180_000, options.timeoutMs * 6))
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
    return { code, timedOut, signalled }
  }
  finally {
    clearTimeout(timer)
    if (forceTimer) {
      clearTimeout(forceTimer)
    }
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    log.end()
    await finished(log)
  }
}
