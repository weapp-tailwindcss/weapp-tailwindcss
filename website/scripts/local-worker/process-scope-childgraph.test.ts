import type { ChildProcess } from 'node:child_process'
import type { ProcessIdentity } from '../../../scripts/demo-e2e-workflow/process-table'
import type { FixtureProcess } from './test-process-state'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { readPosixProcessScope } from '../../../scripts/demo-e2e-workflow/process-scope'
import { collectOwnedProcesses } from '../../../scripts/demo-e2e-workflow/process-table'
import { runWithCleanup } from '../../../scripts/e2e-preflight/cleanup'
import { assertFixtureProcessStopped, stopFixtureProcess } from './test-process-state'
import { localIntegrationTimeout, localTestCleanupMs } from './test-scope'

// 真实父子进程只使用本轮文件、IPC、凭据端口和实际 ChildProcess 句柄。
const fixtureSource = String.raw`
const { spawn } = require('node:child_process')
const { writeFileSync } = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const role = process.argv[2]
const token = process.argv[3]
const lifetime = Number(process.argv[4])
let child
let childClosed
let server
let stopping
function start(role) {
  const instance = spawn(process.execPath, [__filename, role, token, String(lifetime)], {
    cwd: process.cwd(), detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  })
  const closed = new Promise((resolve, reject) => {
    instance.once('error', reject)
    instance.once('close', (code, signal) => resolve({ code, signal }))
  })
  return { instance, closed }
}
function disconnect() {
  if (child && child.connected) child.disconnect()
  if (child) child.unref()
  if (process.connected) process.disconnect()
}
async function stop() {
  if (stopping) return stopping
  stopping = (async () => {
    if (child) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
      let timer
      try {
        const exit = await Promise.race([childClosed, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('owned child close timeout')), 2000)
        })])
        if (exit.code !== 0) throw new Error('owned child cleanup failed: ' + JSON.stringify(exit))
      } finally { clearTimeout(timer) }
    }
    if (server) {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    }
    disconnect()
    process.exit(0)
  })()
  stopping.catch(error => {
    writeFileSync(path.join(process.cwd(), role + '-cleanup-error.txt'), String(error))
    process.exit(1)
  })
  return stopping
}
process.on('SIGTERM', stop)
setTimeout(stop, lifetime).unref()
if (role === 'root') {
  const created = start('anchor')
  child = created.instance
  childClosed = created.closed
  child.once('message', message => process.send(message))
  process.on('message', message => {
    if (message.type === 'exit-root') disconnect()
  })
} else {
  server = http.createServer((req, res) => {
    if (req.url === '/spawn/' + token && role === 'anchor') {
      if (child) { res.writeHead(409); res.end(); return }
      const created = start('leaf')
      child = created.instance
      childClosed = created.closed
      child.once('message', record => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(record))
      })
      return
    }
    res.end(token)
    if (req.url === '/stop/' + token) void stop()
  })
  server.listen(0, '127.0.0.1', () => {
    const record = { pid: process.pid, port: server.address().port, token }
    writeFileSync(path.join(process.cwd(), role + '.json'), JSON.stringify(record))
    if (process.send) process.send(record)
  })
}
`

async function bounded<T>(action: Promise<T>, signal: AbortSignal, timeoutMs = 5000) {
  const controller = new AbortController()
  const combined = AbortSignal.any([signal, controller.signal])
  let timer: NodeJS.Timeout | undefined
  let rejectAbort!: () => void
  try {
    return await Promise.race([action, new Promise<never>((_, reject) => {
      rejectAbort = () => reject(combined.reason)
      combined.addEventListener('abort', rejectAbort, { once: true })
      combined.throwIfAborted()
      timer = setTimeout(() => controller.abort(new Error('本轮真实进程图阶段超过原 5 秒预算')), timeoutMs)
    })])
  }
  finally {
    clearTimeout(timer)
    combined.removeEventListener('abort', rejectAbort)
  }
}

it.skipIf(process.platform === 'win32')('真实根退出后仍从已登记独立组锚发现新建的独立组后代', async ({ signal }) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'website-process-scope-graph-'))
  const script = path.join(directory, 'graph.cjs')
  const token = randomUUID()
  let root: ChildProcess | undefined
  let closed: Promise<unknown> | undefined
  let anchor: FixtureProcess | undefined
  let leaf: FixtureProcess | undefined
  let identities = new Map<number, ProcessIdentity>()
  const record = async (role: string, current?: FixtureProcess) => {
    if (current) {
      return current
    }
    try {
      const value = JSON.parse(await readFile(path.join(directory, `${role}.json`), 'utf8')) as FixtureProcess
      if (value.token !== token) {
        throw new Error('真实进程图凭据不匹配')
      }
      return value
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined
      }
      throw error
    }
  }
  const cleanupRoot = async () => {
    if (!root || !closed) {
      return
    }
    if (root.exitCode === null && root.signalCode === null) {
      // 失败早于锚记录落盘时，由实际根句柄递归回收它仍持有的后代。
      root.kill('SIGTERM')
    }
    const code = await bounded(closed, new AbortController().signal)
    if (code !== 0) {
      throw new Error(`真实根进程未正常完成本轮收尾：exit=${code}`)
    }
  }
  await runWithCleanup(async () => {
    await writeFile(script, fixtureSource)
    root = spawn(process.execPath, [script, 'root', token, String(localIntegrationTimeout(1, 20_000) + localTestCleanupMs)], {
      cwd: directory,
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    closed = new Promise((resolve, reject) => {
      root!.once('error', reject)
      root!.once('close', resolve)
    })
    const listener = new AbortController()
    try {
      const ready = once(root, 'message', { signal: listener.signal }).then(([value]) => value as FixtureProcess)
      anchor = await bounded(Promise.race([ready, closed.then(() => {
        throw new Error('根在锚就绪前退出')
      })]), signal)
    }
    finally { listener.abort() }
    expect(anchor.token).toBe(token)
    const initialDeadline = Date.now() + 5000
    const initial = await readPosixProcessScope({ rootPid: root.pid!, knownPids: [root.pid!], group: root.pid! }, () => initialDeadline, signal)
    const rootIdentity = initial.find(row => row.pid === root!.pid)!
    identities = collectOwnedProcesses(initial, new Map([[root.pid!, rootIdentity]]), root.pid)
    expect(identities.has(anchor.pid)).toBe(true)
    expect(identities.get(anchor.pid)?.group).toBe(anchor.pid)
    root.send({ type: 'exit-root' })
    await bounded(closed, signal)
    const response = await fetch(`http://127.0.0.1:${anchor.port}/spawn/${token}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) })
    expect(response.status).toBe(200)
    leaf = await response.json() as FixtureProcess
    expect(leaf.token).toBe(token)
    const finalDeadline = Date.now() + 5000
    const rows = await readPosixProcessScope({ rootPid: root.pid!, knownPids: [anchor.pid], group: root.pid! }, () => finalDeadline, signal)
    identities = collectOwnedProcesses(rows, identities, root.pid)
    expect(identities.has(root.pid!)).toBe(false)
    expect(identities.has(anchor.pid)).toBe(true)
    expect(identities.has(leaf.pid)).toBe(true)
    expect(identities.get(leaf.pid)?.parent).toBe(anchor.pid)
    expect(identities.get(leaf.pid)?.group).toBe(leaf.pid)
  }, async () => {
    try {
      await runWithCleanup(async () => {
        leaf = await record('leaf', leaf)
        if (leaf) {
          await stopFixtureProcess(leaf, identities.get(leaf.pid))
          await assertFixtureProcessStopped(leaf, identities.get(leaf.pid))
        }
      }, () => runWithCleanup(async () => {
        anchor = await record('anchor', anchor)
        if (anchor) {
          await stopFixtureProcess(anchor, identities.get(anchor.pid))
          await assertFixtureProcessStopped(anchor, identities.get(anchor.pid))
        }
      }, cleanupRoot))
    }
    catch (error) {
      throw new AggregateError([error], `真实进程图收尾未确认，保留本轮证据目录：${directory}`)
    }
    await rm(directory, { recursive: true, force: true })
  })
}, localIntegrationTimeout(1, 20_000))
