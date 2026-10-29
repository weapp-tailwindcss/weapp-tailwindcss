import type { ProcessIdentity } from '../../../../../scripts/demo-e2e-workflow/process-table'
import { strict as assert } from 'node:assert'
import { writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createProcessCommandOwner } from '../../../../../scripts/demo-e2e-workflow/process-command'
import { readProcessSubset, readProcessTable } from '../../../../../scripts/demo-e2e-workflow/process-table'
import { MemoryProbeCleanupError } from '../../../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/probe'
import { createMemorySampler } from '../../../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/sampler'
import { createWatchProcessController } from '../../../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/process-controller'
import { createWatchCommandSession } from '../../../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'
import { cleanupFixture } from './cleanup.mts'

async function main() {
  const [mode, directory, token] = process.argv.slice(2) as [
    string,
    string,
    string,
  ]
  const receipt: Record<string, unknown> = { mode, directory, token, fallbackUsed: false }
  const probeOwner = createProcessCommandOwner()
  let controller: ReturnType<typeof createWatchProcessController> | undefined
  let session: Awaited<ReturnType<typeof createWatchCommandSession>> | undefined
  let registered: ProcessIdentity[] = []
  let didClose = false
  const memoryFailure = mode === 'root-exited-memory-failure' ? new MemoryProbeCleanupError('injected terminal memory cleanup failure') : undefined
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  async function wait(check: () => Promise<boolean>, label: string) {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      if (await check()) {
        return
      }
      ;
      await delay(25)
    }
    throw new Error(`${label} timed out`)
  }
  async function metadata(name: string) {
    const value = JSON.parse(await readFile(path.join(directory, `${name}.json`), 'utf8'))
    assert.equal(value.token, token)
    return value.pid as number
  }
  async function remaining() {
    const current = await readProcessSubset(undefined, registered.map(row => row.pid), 1000, undefined, undefined, probeOwner)
    return current.filter(row => registered.some(previous => previous.pid === row.pid && previous.started === row.started) && !row.zombie)
  }
  try {
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
    const root = fileURLToPath(new URL('./root.mjs', import.meta.url))
    const worker = fileURLToPath(new URL('./worker.mjs', import.meta.url))
    session = await createWatchCommandSession(directory, ['--config.verifyDepsBeforeRun=false', 'exec', process.execPath, root, directory, token, worker], { quietSass: true }, {}, {
      sampler(options) {
        return createMemorySampler(memoryFailure
          ? { ...options, probe: async () => {
              throw memoryFailure
            } }
          : options)
      },
      controller(child) {
        writeFileSync(path.join(directory, 'spawned.json'), JSON.stringify({ pid: child.pid, token }))
        child.once('close', () => {
          didClose = true
        })
        controller = createWatchProcessController(child, {
          observer: {
            table: (timeoutMs, signal) => readProcessTable(timeoutMs, signal, undefined, probeOwner),
            subset: (group, pids, timeoutMs, signal) => readProcessSubset(group, pids, timeoutMs, signal, undefined, probeOwner),
          },
        })
        return controller
      },
    })
    let rootPid = 0
    let workerPid = 0
    await wait(async () => {
      try {
        rootPid = await metadata('root')
        workerPid = await metadata('worker')
        return Number(await readFile(path.join(directory, 'heartbeat'), 'utf8')) > 0
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return false
        }
        ;
        throw error
      }
    }, 'fixture ready')
    // 必须先由生产追踪器登记三层出生身份，才允许根退出。
    await wait(async () => {
      registered = [...controller!.snapshot().values()]
      return [session!.child.pid, rootPid, workerPid].every(pid => registered.some(row => row.pid === pid))
    }, 'production capture barrier')
    receipt.registered = registered
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ token, registered }))
    if (mode.startsWith('root-exited')) {
      await writeFile(path.join(directory, 'release'), token)
      await wait(async () => didClose, 'pnpm close')
      assert(controller!.snapshot().has(workerPid))
    }
    else {
      assert.equal(session.child.exitCode, null)
      assert.equal(session.child.signalCode, null)
      assert.equal(didClose, false)
    }
    receipt.beforeStopProcesses = await remaining()
    assert((receipt.beforeStopProcesses as ProcessIdentity[]).some(row => row.pid === workerPid && registered.some(previous => previous.pid === row.pid && previous.started === row.started)))
    const before = Number(await readFile(path.join(directory, 'heartbeat'), 'utf8'))
    const started = Date.now()
    const stopping = session.stop()
    assert.equal(session.stop(), stopping)
    if (memoryFailure) {
      const error = await stopping.catch(error => error)
      assert.equal(error, memoryFailure)
      receipt.stopOutcome = 'rejected with original terminal memory error'
    }
    else {
      await stopping
      receipt.stopOutcome = 'resolved'
    }
    receipt.stopMs = Date.now() - started
    receipt.afterStop = await remaining()
    receipt.rootClose = didClose
    // 所有生产断言均在兜底清理之前完成。
    assert.equal(didClose, true)
    assert.deepEqual(receipt.afterStop, [])
    const stoppedHeartbeat = Number(await readFile(path.join(directory, 'heartbeat'), 'utf8'))
    await delay(100)
    receipt.heartbeat = [before, stoppedHeartbeat, Number(await readFile(path.join(directory, 'heartbeat'), 'utf8'))]
    assert.equal((receipt.heartbeat as number[])[2], stoppedHeartbeat)
    await assert.rejects(readFile(path.join(directory, 'expired')), { code: 'ENOENT' })
    receipt.passed = true
  }
  catch (error) {
    receipt.error = String(error)
    process.exitCode = 1
  }
  finally {
    const cleanupErrors: string[] = []
    // 各步骤独立执行；查询失败不能跳过自行退出请求、会话停止或 receipt。
    try {
      const needsFallback = receipt.passed !== true
      receipt.fallbackUsed = needsFallback
      const cleanup = await cleanupFixture(directory, token, needsFallback, () => didClose, probeOwner)
      receipt.fixtureCleanup = cleanup
      receipt.businessCleanupVerified = cleanup.verified
    }
    catch (error) {
      cleanupErrors.push(String(error))
      receipt.businessCleanupVerified = false
    }
    try {
      if (session) {
        await session.stop()
      }
    }
    catch (error) {
      cleanupErrors.push(String(error))
    }
    try {
      receipt.finalProcesses = await remaining()
    }
    catch (error) {
      cleanupErrors.push(String(error))
      receipt.businessCleanupVerified = false
    }
    try {
      await probeOwner.close()
    }
    catch (error) {
      cleanupErrors.push(String(error))
      process.exitCode = 1
    }
    receipt.probeCleanup = probeOwner.diagnostics()
    receipt.probeCleanupVerified = probeOwner.diagnostics().cleanupVerified
    receipt.cleanupVerified = receipt.businessCleanupVerified === true && receipt.probeCleanupVerified === true
    receipt.cleanupErrors = cleanupErrors
    if (receipt.cleanupVerified !== true) {
      process.exitCode = 1
    }
    await writeFile(path.join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2))
  }
}

void main().catch((error) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
