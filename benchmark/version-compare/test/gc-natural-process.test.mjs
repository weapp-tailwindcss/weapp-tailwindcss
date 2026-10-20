import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createGcDiagnostics } from '../scripts/gc-diagnostics.mjs'
import { appendNodeImport } from '../scripts/gc-paths.mjs'
import { createServiceFixture, mpxProject, versionFor } from './helpers/gc-service.mjs'

const resources = []
const naturalSource = `
const retained = []
for (let round = 0; round < 250; round += 1) {
  retained.push(Array.from({ length: 150000 }, (_, index) => index + round))
  if (retained.length > 6) retained.shift()
  await new Promise(setImmediate)
}
await new Promise(setImmediate)
process.stdout.write(JSON.stringify({ ready: true, pid: process.pid, forcedGcAvailable: typeof globalThis.gc === 'function', signals: [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')] }) + '\\n')
await new Promise(resolve => process.stdin.once('data', resolve))
`

async function launch(source = naturalSource, enabled = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-gc-process-'))
  const service = source === naturalSource
    ? await createServiceFixture(root, `void (async () => {${source}})()`, 'mpx-cli-service.cjs')
    : await createServiceFixture(root, source)
  const diagnostics = await createGcDiagnostics({ cwd: service.cwd, versionMeta: versionFor(root), projectMeta: mpxProject, directory: path.join(root, 'diag'), kind: 'hmr', run: 1, env: { NODE_OPTIONS: '--no-warnings' } })
  const identity = JSON.parse(diagnostics.env.WEAPP_TW_BENCH_GC_SESSION)
  const env = enabled ? diagnostics.env : { ...diagnostics.env, WEAPP_TW_BENCH_GC_EXPECTED_ENTRY: path.join(root, 'missing-eval-entry') }
  const child = spawn(process.execPath, ['--max-old-space-size=48', service.entry], { cwd: service.cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', chunk => stderr += chunk.toString())
  const exit = once(child, 'exit')
  const ready = new Promise((resolve, reject) => {
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
      if (output.includes('\n')) {
        resolve(JSON.parse(output.trim()))
      }
    })
    child.once('error', reject)
    child.once('exit', code => reject(new Error(`child exited before ready: ${code} ${stderr}`)))
  })
  diagnostics.spawned(child.pid)
  resources.push({ root, child, exit })
  return { root, child, exit, ready, diagnostics, identity, stderr: () => stderr }
}

afterEach(async () => {
  for (const { root, child, exit } of resources.splice(0)) {
    if (child.exitCode == null && child.signalCode == null) {
      child.kill('SIGTERM')
    }
    await exit
    await fs.rm(root, { recursive: true, force: true })
  }
})

async function recordsFor(session, { requireComplete = false } = {}) {
  const file = path.join(session.identity.sessionDirectory, `gc-${session.child.pid}.ndjson`)
  const text = await fs.readFile(file, 'utf8')
  if (requireComplete) {
    expect(text.endsWith('\n')).toBe(true)
  }
  // 活进程和信号退出仅保证同步写入的完整前缀；正常退出仍核对全部尾行。
  const completePrefix = text.slice(0, text.lastIndexOf('\n') + 1)
  expect(completePrefix.length).toBeGreaterThan(0)
  return { file, text, records: completePrefix.trimEnd().split('\n').map(line => JSON.parse(line)) }
}

describe('真实 Node 子进程的天然 GC 证据', () => {
  it('活进程读取完整前缀，正常退出的快照仍拒绝半条尾行和无效完整行', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-gc-snapshot-'))
    try {
      const session = { identity: { sessionDirectory: root }, child: { pid: 123 } }
      const file = path.join(root, 'gc-123.ndjson')
      const startup = { type: 'process-start' }
      const accounting = { type: 'accounting', costs: { dataWrites: 1 } }
      const prefix = `${JSON.stringify(startup)}\n`
      const tail = JSON.stringify(accounting)
      await fs.writeFile(file, prefix + tail.slice(0, 17))
      expect((await recordsFor(session)).records).toEqual([startup])
      await expect(recordsFor(session, { requireComplete: true })).rejects.toThrow()
      await fs.appendFile(file, `${tail.slice(17)}\n`)
      expect((await recordsFor(session, { requireComplete: true })).records).toEqual([startup, accounting])
      await fs.appendFile(file, '{invalid}\n')
      await expect(recordsFor(session)).rejects.toThrow()
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('不暴露 force GC，自然 major 回调立即落盘并绑定实际进程、时钟、角色与 preload', async () => {
    const session = await launch()
    expect(await session.ready).toMatchObject({ ready: true, pid: session.child.pid, forcedGcAvailable: false, signals: [0, 0] })
    const { records, text } = await recordsFor(session)
    expect(records[0]).toMatchObject({ type: 'process-start', pid: session.child.pid, ppid: process.pid, nodeVersion: process.version, preloadMatchesController: true, pathHelperMatchesController: true, identity: { role: 'current', project: mpxProject.key, kind: 'hmr', run: 1 } })
    expect(records[0].preloadSha256).toBe(session.identity.expectedPreloadSha256)
    const batches = records.filter(record => record.type === 'gc-batch')
    expect(batches.length).toBeGreaterThan(0)
    const major = batches.find(record => record.majorCallbackMemory)
    expect(major.majorCallbackMemory).toMatchObject({ samplePoint: 'observer-callback', rss: expect.any(Number), heapUsed: expect.any(Number), external: expect.any(Number), arrayBuffers: expect.any(Number) })
    for (const batch of batches) {
      expect(batch.callbackAtEpochMs).toBeCloseTo(records[0].timeOrigin + batch.callbackAtMonotonicMs, 3)
      expect(batch.events.every(entry => entry.startEpochMs <= batch.callbackAtEpochMs)).toBe(true)
    }
    session.child.stdin.end('done')
    expect((await session.exit)[0]).toBe(0)
    // 活进程可在 batch 与 accounting 两次同步写之间被读取；退出后才核对完整记账。
    const final = await recordsFor(session, { requireComplete: true })
    const finalBatches = final.records.filter(record => record.type === 'gc-batch')
    expect(final.text.startsWith(text)).toBe(true)
    expect(finalBatches.length).toBeGreaterThanOrEqual(batches.length)
    const accounting = final.records.findLast(record => record.type === 'accounting')
    expect(accounting).toMatchObject({ complete: false, observationStopped: false, counts: { eventsTruncated: 0 }, costs: { dataWrites: finalBatches.length + 1 } })
    expect(accounting.counts.major).toBeGreaterThan(0)
    expect(accounting.counts.eventsObserved).toBe(finalBatches.reduce((sum, batch) => sum + batch.events.length, 0))
    expect(accounting.costs.dataWriteMsTotal).toBeGreaterThanOrEqual(0)
    await session.diagnostics.finish()
    const controller = JSON.parse(await fs.readFile(path.join(session.identity.sessionDirectory, 'controller.json'), 'utf8'))
    expect(controller).toMatchObject({ missingPreloadEvidence: false, processEvidence: [{ ready: true, completeFinalLine: true, lastWriteAccounted: true }] })
    expect(session.stderr()).toBe('')
  }, 20000)

  for (const signal of process.platform === 'win32' ? ['SIGTERM'] : ['SIGINT', 'SIGTERM']) {
    it(`${signal} 保持默认信号行为，已写回调不依赖退出 flush`, async () => {
      const session = await launch()
      await session.ready
      const before = await recordsFor(session)
      expect(before.records.some(record => record.type === 'gc-batch')).toBe(true)
      expect(session.child.kill(signal)).toBe(true)
      const [code, receivedSignal] = await session.exit
      if (process.platform !== 'win32') {
        expect(receivedSignal).toBe(signal)
      }
      expect(code).not.toBe(0)
      const after = await recordsFor(session)
      expect(after.text.startsWith(before.text)).toBe(true)
      expect(session.stderr()).toBe('')
    }, 20000)
  }

  it('非 service 与不存在的 argv 入口静默停用，没有文件、信号监听器、timer 或环境改写', async () => {
    const source = `
import process from 'node:process'
const before = { signals: [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')], timers: process.getActiveResourcesInfo().filter(name => name === 'Timeout'), env: process.env.NODE_OPTIONS }
await import(${JSON.stringify(new URL('../scripts/gc-preload.mjs', import.meta.url).href)})
const after = { signals: [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')], timers: process.getActiveResourcesInfo().filter(name => name === 'Timeout'), env: process.env.NODE_OPTIONS }
process.stdout.write(JSON.stringify({ ready: true, before, after }) + '\\n')
await new Promise(resolve => process.stdin.once('data', resolve))
`
    const session = await launch(source, false)
    const result = await session.ready
    expect(result.before).toEqual(result.after)
    expect(result.after).toMatchObject({ signals: [0, 0], timers: [] })
    expect((await fs.readdir(session.identity.sessionDirectory)).filter(file => file.endsWith('.ndjson'))).toEqual([])
    session.child.stdin.end('done')
    await session.exit
    expect(session.stderr()).toBe('')
  })

  it('普通 eval 后代即使继承配置也不新增业务日志', async () => {
    const preload = fileURLToPath(new URL('../scripts/gc-preload.mjs', import.meta.url))
    const child = spawn(process.execPath, ['-e', 'process.stdout.write("eval-ok")', 'missing-script-argument'], {
      env: { ...process.env, NODE_OPTIONS: appendNodeImport('--no-warnings', preload), WEAPP_TW_BENCH_GC_EXPECTED_ENTRY: path.join(os.tmpdir(), 'missing-service'), WEAPP_TW_BENCH_GC_SESSION: '{}' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const output = []
    const errors = []
    child.stdout.on('data', chunk => output.push(chunk.toString()))
    child.stderr.on('data', chunk => errors.push(chunk.toString()))
    const [code] = await once(child, 'exit')
    expect({ code, output: output.join(''), errors: errors.join('') }).toEqual({ code: 0, output: 'eval-ok', errors: '' })
  })
})
