import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter, once } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { createUniServiceFixture, uniProject, versionFor } from './helpers/gc-service.mjs'

const preload = process.env.GC_TRACE_PRELOAD_TEST_PATH
  ?? fileURLToPath(new URL('../scripts/gc-preload.mjs', import.meta.url))
const helper = fileURLToPath(new URL('../scripts/gc-paths.mjs', import.meta.url))
const sha256 = value => createHash('sha256').update(value).digest('hex')
const outputModule = process.env.GC_TRACE_OUTPUT_TEST_PATH
  ?? fileURLToPath(new URL('../scripts/worker-output.mjs', import.meta.url))
const { captureWorkerOutput, maxWorkerOutputBytes } = await import(pathToFileURL(outputModule).href)
const controllerModule = process.env.GC_TRACE_CONTROLLER_TEST_PATH
  ?? fileURLToPath(new URL('../scripts/gc-diagnostics.mjs', import.meta.url))
const { createGcDiagnostics } = await import(pathToFileURL(controllerModule).href)

async function run(enabled, failObserver = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gc-trace-test-'))
  let child
  let exited
  try {
    const source = path.join(root, 'entry.mjs')
    const copied = path.join(root, 'gc-preload.mjs')
    await fs.copyFile(preload, copied)
    await fs.copyFile(helper, path.join(root, 'gc-paths.mjs'))
    const wrapper = path.join(root, 'failed-observer.mjs')
    if (failObserver) {
      await fs.writeFile(wrapper, `import { PerformanceObserver } from 'node:perf_hooks'; PerformanceObserver.prototype.observe = () => { throw new Error('fixture observer failure') }; await import(${JSON.stringify(pathToFileURL(copied).href)});`)
    }
    await fs.writeFile(source, `
const retained = []
for (let round = 0; round < 250; round += 1) {
  retained.push(Array.from({ length: 150000 }, (_, index) => index + round))
  if (retained.length > 6) retained.shift()
  await new Promise(setImmediate)
}
await new Promise(setImmediate)
process.stdout.write('TRACE_FIXTURE ' + JSON.stringify({ forcedGcAvailable: typeof globalThis.gc === 'function', signals: [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')] }) + '\\n')
`)
    const identity = { traceGcNvp: true, sessionDirectory: root, expectedPreloadSha256: sha256(await fs.readFile(copied)), expectedPathHelperSha256: sha256(await fs.readFile(helper)) }
    child = spawn(process.execPath, ['--max-old-space-size=48', source], {
      env: { ...process.env, NODE_OPTIONS: `--no-warnings --import=${pathToFileURL(failObserver ? wrapper : copied).href}`, WEAPP_TW_BENCH_GC_EXPECTED_ENTRY: enabled ? source : path.join(root, 'other-entry.mjs'), WEAPP_TW_BENCH_GC_SESSION: JSON.stringify(identity) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    exited = once(child, 'close')
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => stdout += chunk.toString())
    child.stderr.on('data', chunk => stderr += chunk.toString())
    const [code, signal] = await exited
    expect({ code, signal }).toEqual({ code: 0, signal: null })
    if (failObserver) {
      expect(stderr).toContain('fixture observer failure')
    }
    else {
      expect(stderr).toBe('')
    }
    const files = (await fs.readdir(root)).filter(file => file.endsWith('.ndjson'))
    const records = files.length ? (await fs.readFile(path.join(root, files[0]), 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line)) : []
    const fixtureLine = stdout.split('\n').find(line => line.startsWith('TRACE_FIXTURE '))
    expect(JSON.parse(fixtureLine.slice('TRACE_FIXTURE '.length))).toEqual({ forcedGcAvailable: false, signals: [0, 0] })
    return { stdout, records, pid: child.pid }
  }
  finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
    }
    if (exited) {
      await exited
    }
    await fs.rm(root, { recursive: true, force: true })
  }
}

it('自然 GC trace 绑定 PID 并保留 GC 后堆量，回调物理堆与 OS 映射明确标记时点', async () => {
  const result = await run(true)
  expect(result.records[0]).toMatchObject({ type: 'process-start', pid: result.pid, traceGcNvp: true, explicitGcRequests: 0, preloadMatchesController: true, pathHelperMatchesController: true })
  expect(result.stdout).toMatch(new RegExp(`\\[${result.pid}:.* gc=mc .*total_size_after=\\d+`))
  const major = result.records.find(record => record.majorCallbackMemory)?.majorCallbackMemory
  expect(major).toMatchObject({ samplePoint: 'observer-callback', v8Heap: { total_physical_size: expect.any(Number) }, residentMapping: { supported: process.platform === 'linux' } })
  expect(major.completedAtEpochMs).toBeGreaterThanOrEqual(major.atEpochMs)
  if (process.platform === 'linux') {
    expect(major.residentMapping.text).toMatch(/Rss:\s+\d+ kB/)
  }
  expect(result.records.findLast(record => record.type === 'accounting')).toMatchObject({ counts: { eventsTruncated: 0 }, observationStopped: false })
}, 20000)

it('不匹配的业务入口没有 trace、GC 文件或信号处理器', async () => {
  const result = await run(false)
  expect(result.records).toEqual([])
  expect(result.stdout).not.toMatch(/gc=(?:mc|s)/)
}, 20000)

it('observer 启动失败后停用 trace，保留错误且不依赖退出 flush', async () => {
  const result = await run(true, true)
  expect(result.stdout).not.toMatch(/gc=(?:mc|s)/)
  expect(result.records.find(record => record.type === 'recording-error')).toMatchObject({ error: 'fixture observer failure' })
}, 20000)

it('原始 stdout/stderr 分块按字节保留，close 后回执绑定完整文件', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gc-output-test-'))
  let recorder
  try {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() })
    recorder = captureWorkerOutput(child, directory, (error) => {
      throw error
    })
    const content = Buffer.from('中文 trace')
    child.stdout.emit('data', content.subarray(0, 2))
    child.stdout.emit('data', content.subarray(2))
    child.stderr.emit('data', Buffer.from('stderr'))
    child.emit('close', 0)
    const receipt = recorder.finish()
    const bytes = await fs.readFile(path.join(directory, receipt.file))
    expect(receipt).toMatchObject({ complete: true, bytes: bytes.length, chunks: 3, sha256: sha256(bytes), maxBytes: 2 * 1024 * 1024 })
    const rows = bytes.toString().trimEnd().split('\n').map(line => JSON.parse(line))
    expect(Buffer.concat(rows.filter(row => row.stream === 'stdout').map(row => Buffer.from(row.base64, 'base64')))).toEqual(content)
    expect(rows.every(row => Number.isSafeInteger(row.atEpochMs))).toBe(true)
    expect(child.stdout.listenerCount('data')).toBe(0)
  }
  finally {
    recorder?.finish()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it('原始输出超过固定上限时只调用一次失败处理，前缀不能标为完整', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gc-output-limit-'))
  let recorder
  try {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() })
    const failures = []
    recorder = captureWorkerOutput(child, directory, error => failures.push(error))
    child.stdout.emit('data', Buffer.alloc(maxWorkerOutputBytes + 1))
    child.stdout.emit('data', Buffer.from('ignored after failure'))
    child.emit('close', 0)
    expect(failures).toHaveLength(1)
    const receipt = recorder.finish()
    expect(receipt).toMatchObject({ complete: false, bytes: 0, recordingError: expect.stringContaining('2 MiB') })
    expect((await fs.stat(path.join(directory, receipt.file))).size).toBe(0)
    expect(child.stdout.listenerCount('data')).toBe(0)
  }
  finally {
    recorder?.finish()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it('close 前结束的回执不能在后来 close 后升级为完整', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gc-output-incomplete-'))
  let recorder
  try {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() })
    recorder = captureWorkerOutput(child, directory, (error) => {
      throw error
    })
    child.stdout.emit('data', Buffer.from('prefix'))
    expect(recorder.finish().complete).toBe(false)
    child.stdout.emit('data', Buffer.from('unrecorded tail'))
    child.emit('close', 0)
    expect(recorder.finish().complete).toBe(false)
  }
  finally {
    recorder?.finish()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it('实际 controller 交付完整 trace 回执并绑定实际 Node 的 GC 文件', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gc-controller-output-'))
  let child
  let exited
  try {
    const service = await createUniServiceFixture(root, `const retained = []; for (let round = 0; round < 250; round++) { retained.push(Array.from({length: 150000}, (_, index) => index + round)); if (retained.length > 6) retained.shift(); await new Promise(setImmediate) }; await new Promise(setImmediate); console.log('controller-fixture-done')`)
    const diagnostics = await createGcDiagnostics({ cwd: service.cwd, versionMeta: versionFor(root), projectMeta: uniProject, directory: path.join(root, 'evidence'), kind: 'hmr', run: 1, env: { WEAPP_TW_BENCH_GC_NVP: '1', NODE_OPTIONS: '--no-warnings' } })
    const identity = JSON.parse(diagnostics.env.WEAPP_TW_BENCH_GC_SESSION)
    child = spawn(process.execPath, ['--max-old-space-size=48', service.entry], { cwd: service.cwd, detached: process.platform !== 'win32', env: { ...process.env, ...diagnostics.env }, stdio: ['ignore', 'pipe', 'pipe'] })
    exited = once(child, 'close')
    diagnostics.spawned(child.pid, child)
    expect((await exited)[0]).toBe(0)
    await diagnostics.finish()
    const manifest = JSON.parse(await fs.readFile(path.join(identity.sessionDirectory, 'controller.json'), 'utf8'))
    const output = await fs.readFile(path.join(identity.sessionDirectory, manifest.outputEvidence.file))
    expect(manifest.outputEvidence).toMatchObject({ complete: true, bytes: output.length, sha256: sha256(output) })
    expect(manifest.processEvidence).toEqual([expect.objectContaining({ ready: true, pid: child.pid, lastWriteAccounted: true })])
    const raw = Buffer.concat(output.toString().trimEnd().split('\n').map(line => Buffer.from(JSON.parse(line).base64, 'base64'))).toString()
    expect(raw).toMatch(new RegExp(`\\[${child.pid}:.*gc=mc .*total_size_after=\\d+`))
    expect(raw).toContain('controller-fixture-done')
  }
  finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
    }
    if (exited) {
      await exited
    }
    await fs.rm(root, { recursive: true, force: true })
  }
}, 20000)

it('严格 controller 保存 manifest 后拒绝输出超限或缺失 GC 证据', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gc-controller-failure-'))
  try {
    const service = await createUniServiceFixture(root)
    const diagnostics = await createGcDiagnostics({ cwd: service.cwd, versionMeta: versionFor(root), projectMeta: uniProject, directory: path.join(root, 'evidence'), kind: 'hmr', run: 1, env: { WEAPP_TW_BENCH_GC_NVP: '1' } })
    const identity = JSON.parse(diagnostics.env.WEAPP_TW_BENCH_GC_SESSION)
    const child = Object.assign(new EventEmitter(), { pid: 123, exitCode: 0, signalCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() })
    diagnostics.spawned(child.pid, child)
    child.stdout.emit('data', Buffer.alloc(maxWorkerOutputBytes + 1))
    child.emit('close', 0)
    await expect(diagnostics.finish()).rejects.toThrow('2 MiB')
    const manifest = JSON.parse(await fs.readFile(path.join(identity.sessionDirectory, 'controller.json'), 'utf8'))
    expect(manifest).toMatchObject({ missingPreloadEvidence: true, outputEvidence: { complete: false, recordingError: expect.stringContaining('2 MiB') } })
  }
  finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
it('严格模式创建 session 失败时立即拒绝，默认模式保留旧行为', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gc-controller-setup-'))
  try {
    const blocker = path.join(root, 'not-a-directory')
    await fs.writeFile(blocker, 'fixture')
    const options = { cwd: root, versionMeta: versionFor(root), projectMeta: uniProject, directory: blocker, kind: 'hmr', run: 1 }
    await expect(createGcDiagnostics({ ...options, env: { WEAPP_TW_BENCH_GC_NVP: '1' } })).rejects.toThrow()
    await expect(createGcDiagnostics({ ...options, env: { WEAPP_TW_BENCH_GC_NVP: '0' } })).resolves.toBeUndefined()
  }
  finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

it('严格 controller 拒绝缺失 accounting 字段而非把缺证解释为零截断', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gc-accounting-shape-'))
  try {
    const service = await createUniServiceFixture(root)
    for (const accounting of [{ costs: { dataWrites: 1 }, observationStopped: false }, { costs: { dataWrites: 1 }, counts: { eventsTruncated: 0 } }]) {
      const diagnostics = await createGcDiagnostics({ cwd: service.cwd, versionMeta: versionFor(root), projectMeta: uniProject, directory: path.join(root, 'evidence'), kind: 'hmr', run: 1, env: { WEAPP_TW_BENCH_GC_NVP: '1' } })
      const identity = JSON.parse(diagnostics.env.WEAPP_TW_BENCH_GC_SESSION)
      const child = Object.assign(new EventEmitter(), { exitCode: 0, stdout: new EventEmitter(), stderr: new EventEmitter() })
      diagnostics.spawned(123, child)
      child.emit('close', 0)
      const startup = { type: 'process-start', pid: 123, identity, actualEntry: await fs.realpath(service.entry), preloadSha256: identity.expectedPreloadSha256, pathHelperSha256: identity.expectedPathHelperSha256 }
      await fs.writeFile(path.join(identity.sessionDirectory, 'gc-123.ndjson'), `${[startup, { type: 'accounting', ...accounting }].map(record => JSON.stringify(record)).join('\n')}\n`)
      await expect(diagnostics.finish()).rejects.toThrow('不完整')
      const manifest = JSON.parse(await fs.readFile(path.join(identity.sessionDirectory, 'controller.json'), 'utf8'))
      expect(manifest.processEvidence[0]).toMatchObject({ ready: true, lastWriteAccounted: true })
    }
  }
  finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
