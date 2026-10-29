import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { processOwnership, runOwned } from '../owned-process.mjs'
import { createRuntimeGuardSession, readRuntimeGuardEvidence } from '../runtime-guard.mjs'
import { createTerminationObserver, receiptRecords } from './external.mjs'
import linux from './linux.cjs'
import { observeReferences } from './lifetime.cjs'
import { validateExternalTermination } from './termination.mjs'

function fixture() {
  const bootId = '00000000-0000-0000-0000-000000000001'
  const rootIdentity = { pid: 100, tid: 100, birth: '10', processBirth: '10', bootId, state: 'S', ppid: 1, pgid: 100, executable: '/node', argv: ['/node', 'build'] }
  const workerIdentity = { ...rootIdentity, tid: 107, birth: '11' }
  const nativeIdentity = { ...rootIdentity, pid: 200, tid: 200, birth: '20', processBirth: '20', ppid: 100, executable: '/esbuild', argv: ['/esbuild', '--service=0.21.5', '--ping'], sha256: 'native-sha', executableIdentity: { device: '1', inode: '2' } }
  const service = { version: '0.21.5', entry: '/esbuild-main.js', sha256: 'source-sha', manifest: '/esbuild-package.json', manifestSha256: 'manifest-sha', helper: { path: '/esbuild', sha256: 'native-sha', args: ['--service=0.21.5', '--ping'] } }
  const root = { isolate: 'main', pid: 100, threadId: 0, osIdentity: rootIdentity }
  const child = { isolate: 'worker', pid: 100, threadId: 1, osIdentity: workerIdentity }
  const workerIntent = { kind: 'launch-intent', isolate: 'main', launch: 'w', pid: 100, sequence: 3, targetKind: 'worker', filename: service.entry, sha256: service.sha256, serviceVersion: service.version }
  const nativeIntent = { kind: 'launch-intent', isolate: 'worker', launch: 'n', pid: 100, sequence: 3, targetKind: 'native', filename: service.helper.path, sha256: service.helper.sha256, args: service.helper.args }
  const records = [
    { kind: 'service-load', isolate: 'main', filename: service.entry, sha256: service.sha256, version: service.version, sequence: 2 },
    workerIntent,
    { kind: 'launch-reference', isolate: 'main', launch: 'w', resource: 'handle', referenced: false, sequence: 4 },
    { kind: 'service-load', isolate: 'worker', filename: service.entry, sha256: service.sha256, version: service.version, sequence: 2 },
    nativeIntent,
    ...['handle', 'stdin', 'stdout'].map((resource, i) => ({ kind: 'launch-reference', isolate: 'worker', launch: 'n', resource, referenced: false, sequence: 5 + i })),
  ]
  function target(key, expected) {
    return { key, expected, firstSeen: { at: 10, identity: expected }, lastSeen: { at: 80, identity: expected }, firstGone: { at: 100, state: 'absent' }, lastObserved: { at: 105, state: 'absent' } }
  }
  const proof = { available: true, observationErrors: [], schemaVersion: 1, session: 's', rootPid: 100, beforeCleanup: true, rootClose: { code: 0, signal: null, pid: 100, observedAt: 100, exit: { code: 0, signal: null, observedAt: 99 } }, deadline: 1100, finishedAt: 105, controllerSignals: [], targets: [target('root', rootIdentity), target('isolate:worker', workerIdentity), target('launch:n', nativeIdentity)] }
  const session = { id: 's', unrefServices: [service] }
  const digest = file => ({ '/esbuild-main.js': 'source-sha', '/esbuild-package.json': 'manifest-sha' })[file]
  const common = { session, root, records, proof, digest }
  return {
    ...common, child, workerIntent, nativeIntent,
    worker: () => validateExternalTermination({ ...common, intent: workerIntent, start: { targetPid: 100, targetThreadId: 1 }, child }),
    native: () => validateExternalTermination({ ...common, intent: nativeIntent, start: { targetPid: 200, osIdentity: nativeIdentity } }),
  }
}

test('特定官方 unref 服务仅获得独立停止结论，不补造内部 close 或正常退出状态', () => {
  const value = fixture()
  assert.equal(value.worker().kind, 'thread-stopped-at-root-boundary')
  const result = value.native()
  assert.equal(result.internalClose, false)
  assert.equal(result.statusKnown, false)
  assert.equal(result.code, 'unknown')
  assert.equal(result.signal, 'unknown')
  assert.equal(result.cause, 'unknown')
})

for (const [name, corrupt] of [
  ['没有 unref', f => { f.records.splice(f.records.findIndex(e => e.launch === 'n' && e.resource === 'handle'), 1) }],
  ['unref 后恢复 ref', f => { f.records.push({ kind: 'launch-reference', isolate: 'worker', launch: 'n', resource: 'handle', referenced: true }) }],
  ['管道仍 ref', f => { f.records.find(e => e.resource === 'stdin').referenced = true }],
  ['其它 launch 的 unref', f => { f.records.find(e => e.launch === 'n' && e.resource === 'handle').launch = 'other' }],
  ['没有独立首见活', f => { delete f.proof.targets[2].firstSeen }],
  ['首见已经 zombie', f => { f.proof.targets[2].firstSeen = { at: 10, identity: { ...f.proof.targets[2].expected, state: 'Z' } } }],
  ['相同出生身份仍未 reap', f => { f.proof.targets[2].lastObserved.state = 'zombie' }],
  ['首见 SHA 未独立核对', f => { f.proof.targets[2].firstSeen = { at: 10, identity: { ...f.proof.targets[2].expected, sha256: 'wrong' } } }],
  ['controller signal 污染', f => { f.proof.controllerSignals.push({ issuedAt: 90, signal: 'SIGTERM' }) }],
  ['清理后才取证', f => { f.proof.beforeCleanup = false }],
  ['超过截止才消失', f => { f.proof.targets[2].firstGone.at = 1200 }],
  ['root close 后未复核', f => { f.proof.targets[2].lastObserved.at = 90 }],
  ['非零 root', f => { f.proof.rootClose.code = 1 }],
  ['root 被 signal', f => { f.proof.rootClose.exit.signal = 'SIGTERM' }],
  ['helper argv 不符', f => { f.nativeIntent.args = [] }],
  ['父 isolate 未加载官方源码', f => { f.records.find(e => e.kind === 'service-load' && e.isolate === 'worker').sha256 = 'other' }],
  ['前轮会话', f => { f.proof.session = 'old' }],
]) {
  test(`外部停止负回归：${name}`, () => {
    const value = fixture()
    corrupt(value)
    assert.throws(value.native)
  })
}

test('Worker 入口、OS TID、线程组出生身份或子资源不符仍失败', () => {
  for (const corrupt of [
    f => { f.workerIntent.filename = '/other.js' },
    f => { f.child.osIdentity = { ...f.child.osIdentity, tid: 100 } },
    f => { f.child.osIdentity = { ...f.child.osIdentity, processBirth: 'other' } },
    f => { f.records.push({ kind: 'launch-intent', isolate: 'worker', launch: 'extra' }) },
  ]) {
    const value = fixture()
    corrupt(value)
    assert.throws(value.worker)
  }
})

test('最后恢复 unref 及相同编号的新出生身份不妨碍确认旧实例停止', () => {
  const value = fixture()
  value.records.push({ kind: 'launch-reference', isolate: 'worker', launch: 'n', resource: 'handle', referenced: true })
  value.records.push({ kind: 'launch-reference', isolate: 'worker', launch: 'n', resource: 'handle', referenced: false })
  value.proof.targets[2].firstGone = { at: 100, state: 'reused', replacement: { ...value.proof.targets[2].expected, birth: 'new' } }
  value.proof.targets[2].lastObserved.state = 'reused'
  assert.equal(value.native().statusKnown, false)
})

test('ref/unref 包装保留 receiver、参数、返回值及异常，只记录真实成功操作', () => {
  const events = []
  const object = { unref(value) { assert.equal(this, object); if (value === 'fail') throw new Error('failed'); return value }, ref() { return this } }
  observeReferences(object, 'launch', 'handle', (kind, details) => events.push({ kind, ...details }))
  assert.equal(object.unref('original'), 'original')
  assert.equal(object.ref(), object)
  assert.throws(() => object.unref('fail'), /failed/)
  assert.deepEqual(events.map(e => e.referenced), [false, true])
})

test('运行中半行暂存，完整后只消费一次，最终半行不放行', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'compiler-partial-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(path.join(directory, 'events'))
  const file = path.join(directory, 'events', 'one.ndjson')
  const line = JSON.stringify({ session: 's', kind: 'launch-reference', referenced: true })
  await writeFile(file, line.slice(0, 10))
  const session = { id: 's', directory }
  assert.equal(receiptRecords(session).length, 0)
  assert.throws(() => receiptRecords(session, true), /未完成/)
  await writeFile(file, `${line}\n`)
  assert.equal(receiptRecords(session).length, 1)
  assert.equal(receiptRecords(session, true)[0].referenced, true)
})

async function observerFixture(t, behavior = {}) {
  const value = fixture()
  const directory = await mkdtemp(path.join(tmpdir(), 'compiler-os-observer-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(path.join(directory, 'events'))
  const entities = new Map(value.proof.targets.map(item => [`${item.expected.pid}:${item.expected.tid}`, structuredClone(item.expected)]))
  const entries = [
    { kind: 'ready', isolate: 'main', pid: 100, threadId: 0, osIdentity: value.root.osIdentity },
    { kind: 'ready', isolate: 'worker', pid: 100, threadId: 1, osIdentity: value.child.osIdentity },
    { kind: 'launch-start', isolate: 'main', launch: 'w', targetPid: 100, targetThreadId: 1 },
    { kind: 'launch-start', isolate: 'worker', launch: 'n', targetPid: 200, osIdentity: value.proof.targets[2].expected },
  ].map(entry => ({ session: 's', ...entry }))
  await writeFile(path.join(directory, 'events', 'receipt.ndjson'), `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`)
  let at = 50
  let finishing = false
  const missing = () => Object.assign(new Error('missing entity'), { code: 'ENOENT' })
  const observer = createTerminationObserver({ id: 's', directory }, {
    platform: 'linux', now: () => at,
    sleep: async ms => { at += ms },
    read(pid, tid, options) {
      const original = entities.get(`${pid}:${tid}`)
      if (!original) throw missing()
      if (behavior.read) return behavior.read({ pid, tid, options, original, finishing, at, missing })
      if (finishing && (pid === 100 || at >= (behavior.goneAt ?? 125))) throw missing()
      return { ...original, state: finishing || behavior.initialZombie && pid === 200 ? 'Z' : 'S' }
    },
  })
  observer.start(100)
  return {
    ...value, observer,
    file: path.join(directory, 'events', 'receipt.ndjson'),
    async finish() {
      finishing = true
      at = 100
      value.proof = await observer.finish({ code: 0, signal: null, pid: 100, observedAt: 100, exit: { code: 0, signal: null, observedAt: 99 } }, { signalAttempts: [] })
      return value.proof
    },
    validate(proof) { return validateExternalTermination({ session: value.session, root: value.root, intent: value.nativeIntent, start: { targetPid: 200, osIdentity: entities.get('200:200') }, records: value.records, proof, digest: value.digest }) },
  }
}

test('外部观察先见活，区分 zombie 与真正消失，并保留有界时间区间', async (t) => {
  const value = await observerFixture(t)
  value.observer.sample()
  const proof = await value.finish()
  const helper = proof.targets.find(item => item.key === 'launch:n')
  assert.deepEqual(helper.observations.map(item => item.state), ['alive', 'zombie', 'absent'])
  assert.equal(helper.firstGone.at, 125)
  assert.equal(value.validate(proof).statusKnown, false)
})

for (const [name, behavior] of [
  ['首次已经 zombie', { initialZombie: true }],
  ['zombie 截止仍未 reap', { goneAt: 5000 }],
]) {
  test(`外部观察拒绝：${name}`, async (t) => {
    const value = await observerFixture(t, behavior)
    value.observer.sample()
    await assert.rejects(value.finish(), /外部停止/)
    const proof = value.observer.evidence()
    assert.throws(() => value.validate(proof))
  })
}

test('外部观察的权限失败及 exe 缺席但 stat 仍活不能误报已停止', async (t) => {
  for (const kind of ['permission', 'missing-exe']) {
    const value = await observerFixture(t, { read({ pid, options, original, missing }) {
      if (pid === 200) {
        if (kind === 'permission') throw Object.assign(new Error('permission'), { code: 'EACCES' })
        if (options?.executable) throw missing()
      }
      return original
    } })
    assert.throws(() => value.observer.sample(), /permission|missing entity/)
  }
})

test('Linux stat 解析保留独立 PID/TID 出生身份，不能把 Node threadId 当 OS TID', () => {
  const fields = ['S', '2', '10', ...Array.from({ length: 16 }, () => '0'), '12345']
  assert.deepEqual(linux.parseStat(`107 (a worker ) name) ${fields.join(' ')}`), { id: 107, state: 'S', ppid: 2, pgid: 10, birth: '12345' })
  assert.throws(() => linux.parseStat('107 malformed'))
})

test('同名同版本但改写的 esbuild 入口不能登记为官方 unref service', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'compiler-service-source-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(path.join(directory, 'lib'))
  const metadata = JSON.stringify({ name: 'esbuild', version: '0.21.5', main: 'lib/main.js' })
  await writeFile(path.join(directory, 'package.json'), metadata)
  await writeFile(path.join(directory, 'lib', 'main.js'), 'module.exports = {}')
  const helper = path.join(directory, 'helper')
  await writeFile(helper, 'fixture', { mode: 0o755 })
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
  assert.throws(() => createRuntimeGuardSession(path.join(directory, 'guard'), {
    nativeHelpers: [{ path: helper, sha256: sha256('fixture'), args: ['--service=0.21.5', '--ping'] }],
    unrefServices: [{ directory, manifestSha256: sha256(metadata) }],
  }), /official published source/)
})

test('固定 Linux 上实际官方 esbuild 同步 worker/helper 的 unref 生命周期独立验收', { skip: process.platform !== 'linux' }, async (t) => {
  const require = createRequire(import.meta.url)
  const entry = require.resolve('esbuild')
  const directory = path.dirname(path.dirname(entry))
  const metadataFile = path.join(directory, 'package.json')
  const metadata = JSON.parse(await readFile(metadataFile, 'utf8'))
  const nativeManifest = createRequire(entry).resolve(`@esbuild/linux-${process.arch}/package.json`)
  const binary = path.join(path.dirname(nativeManifest), 'bin', 'esbuild')
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
  const temporary = await mkdtemp(path.join(tmpdir(), 'compiler-unref-real-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const guard = createRuntimeGuardSession(path.join(temporary, 'guard'), {
    nativeHelpers: [{ path: binary, sha256: sha256(await readFile(binary)), args: [`--service=${metadata.version}`, '--ping'] }],
    unrefServices: [{ directory, manifestSha256: sha256(await readFile(metadataFile)) }],
  })
  const script = path.join(temporary, 'fixture.cjs')
  await writeFile(script, `require(${JSON.stringify(entry)}).transformSync('let value = 1'); setTimeout(()=>{},400)\n`)
  const observer = createTerminationObserver(guard.session)
  const outcome = await runOwned(process.execPath, [...guard.execArgv, script], {
    cwd: temporary, env: { ...process.env, ...guard.env }, stdio: 'ignore', timeoutMs: 10000,
    onSpawn(child, ownership) { observer.start(child.pid, ownership) },
    onPoll: () => observer.sample(),
    onSettled: (close, ownership) => observer.finish(close, ownership),
  })
  const evidence = readRuntimeGuardEvidence(guard.session, { rootPid: outcome.pid, termination: observer.evidence() })
  const partial = evidence.launches.filter(item => !item.internalCloseComplete)
  assert.equal(partial.length, 2)
  assert.ok(partial.every(item => item.terminationEvidence.statusKnown === false && item.close === null))
})

test('真实控制器先固定自然 close 证据，再记录带出生身份的定向清理 signal', { skip: process.platform === 'win32' }, async () => {
  let beforeCleanup
  const script = 'const child=require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});child.unref();setTimeout(()=>{},600)'
  const result = await runOwned(process.execPath, ['-e', script], {
    cwd: process.cwd(), stdio: 'ignore', timeoutMs: 5000,
    onSettled(close, state) { beforeCleanup = structuredClone({ close, signalAttempts: state.signalAttempts }); assert.equal(state.groupGone, false) },
  })
  assert.equal(result.code, 0)
  assert.equal(beforeCleanup.close.code, 0)
  assert.deepEqual(beforeCleanup.signalAttempts, [])
  const state = processOwnership().at(-1)
  assert.equal(state.groupGone, true)
  assert.ok(state.signalAttempts.length > 0)
  assert.ok(state.signalAttempts.every(item => item.issuedAt >= beforeCleanup.close.observedAt && item.identities.every(identity => typeof identity.birth === 'string') && item.result === 'returned'))
})
