import type { Measurement, Mode, Ready, Request, WorkerReply } from './types'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export async function createWorker(root: string, mode: Mode) {
  const require = createRequire(join(root, 'package.json'))
  const child = fork(fileURLToPath(new URL('./worker.ts', import.meta.url)), [root, mode], {
    cwd: resolve(root, 'packages', 'weapp-tailwindcss'),
    execArgv: ['--import', require.resolve('tsx')],
    // 此基准只比较 Oxc AST 传输，不允许原生事实接口绕开被测解析器。
    env: { ...process.env, WEAPP_TW_NATIVE: 'off' },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })
  let pending: { resolve: (reply: WorkerReply) => void, reject: (error: Error) => void } | undefined
  child.on('message', (reply: WorkerReply) => {
    if (reply.type === 'error') {
      pending?.reject(new Error(reply.stack ?? reply.message))
    }
    else {
      pending?.resolve(reply)
    }
    pending = undefined
  })
  child.on('error', error => pending?.reject(error))
  child.on('exit', (code, signal) => pending?.reject(new Error(`Worker ${mode} exited (${signal ?? code})`)))
  const wait = () => new Promise<WorkerReply>((resolveReply, reject) => {
    const timer = setTimeout(() => reject(new Error(`Worker ${mode} response timed out`)), 30_000)
    pending = {
      resolve: (reply) => {
        clearTimeout(timer)
        resolveReply(reply)
      },
      reject: (error) => {
        clearTimeout(timer)
        reject(error)
      },
    }
  })
  const close = async () => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return
    }
    const exited = once(child, 'exit')
    child.kill()
    await exited
  }
  try {
    const ready = await wait()
    assert.equal(ready.type, 'ready')
    return {
      metadata: ready as Ready,
      async measure(request: Request): Promise<Measurement> {
        const response = wait()
        child.send(request)
        const reply = await response
        assert.equal(reply.type, 'measurement')
        return reply as Measurement
      },
      close,
    }
  }
  catch (error) {
    await close()
    throw error
  }
}
