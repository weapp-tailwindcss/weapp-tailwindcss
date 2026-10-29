import assert from 'node:assert/strict'
import { appendFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ownershipStopped } from '../owned-process.mjs'
import { createTerminationObserver } from './external.mjs'
import { readReceiptSnapshot, receiptSeal, verifyReceiptSeal } from './receipts.mjs'

async function fixture(t, failingPhase) {
  const directory = await mkdtemp(path.join(tmpdir(), 'compiler-observer-partial-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(path.join(directory, 'events'))
  const identity = { pid: 100, tid: 100, birth: '10', processBirth: '10', bootId: '00000000-0000-0000-0000-000000000001', state: 'S', ppid: 1, pgid: 100, executable: '/node', argv: ['/node'] }
  const file = path.join(directory, 'events', 'receipt.ndjson')
  const source = `${JSON.stringify({ session: 's', kind: 'ready', isolate: 'root', pid: 100, threadId: 0, osIdentity: identity })}\n`
  await writeFile(file, source)
  let phase = 'start'
  const ownership = { closed: true, groupGone: true, signalAttempts: [] }
  const observer = createTerminationObserver({ id: 's', directory }, {
    platform: 'linux', now: () => 100,
    read() {
      if (phase === failingPhase) throw Object.assign(new Error(`first ${phase} observer failure`), { code: 'EACCES' })
      return { ...identity }
    },
  })
  return { observer, file, source, ownership, phase: value => { phase = value } }
}

for (const phase of ['start', 'sample', 'finish']) {
  test(`observer ${phase} 异常仍保留合法 JSON 的 partial、首错及活身份，阻止副本清理`, async (t) => {
    const value = await fixture(t, phase)
    if (phase === 'start') assert.throws(() => value.observer.start(100, value.ownership), /first start/)
    else {
      value.observer.start(100, value.ownership)
      value.phase(phase)
      if (phase === 'sample') assert.throws(() => value.observer.sample(), /first sample/)
      else await assert.rejects(value.observer.finish({ code: 0, signal: null, pid: 100, observedAt: 100, exit: { code: 0, signal: null, observedAt: 99 } }, value.ownership), /first finish/)
    }
    value.ownership.signalAttempts.push({ issuedAt: 101, signal: 'SIGTERM' })
    const evidence = JSON.parse(JSON.stringify(value.observer.evidence()))
    assert.equal(evidence.available, false)
    assert.equal(evidence.partial, true)
    assert.match(evidence.primaryError.message, new RegExp(`first ${phase}`))
    assert.equal(evidence.observationErrors.length, 1)
    assert.equal(evidence.controllerSignals.length, 1)
    if (phase !== 'start') assert.ok(evidence.targets.some(target => target.firstSeen))
    assert.equal(ownershipStopped(value.ownership), false)
  })
}

for (const change of ['truncate-ref', 'truncate-violation', 'replace', 'rewrite', 'partial-rewind', 'delete']) {
  test(`observer 拒绝已见收据回退：${change}`, async (t) => {
    const value = await fixture(t)
    value.observer.start(100, value.ownership)
    const tail = change === 'truncate-violation' ? { kind: 'violation', reason: 'forbidden' } : { kind: 'launch-reference', launch: 'service', referenced: true }
    await appendFile(value.file, `${JSON.stringify({ session: 's', ...tail })}\n`)
    value.observer.sample()
    if (change.startsWith('truncate')) await writeFile(value.file, value.source)
    if (change === 'replace') { await rename(value.file, `${value.file}.old`); await writeFile(value.file, await readFile(`${value.file}.old`)); await rm(`${value.file}.old`) }
    if (change === 'rewrite') await writeFile(value.file, (await readFile(value.file, 'utf8')).replace('true', 'null'))
    if (change === 'partial-rewind') { await appendFile(value.file, '{"session":'); value.observer.sample(); await writeFile(value.file, value.source) }
    if (change === 'delete') await rm(value.file)
    assert.throws(() => value.observer.sample(), /被替换|截断|改写|被删除/)
    const evidence = value.observer.evidence()
    assert.equal(evidence.available, false)
    assert.ok(evidence.primaryError)
    assert.equal(ownershipStopped(value.ownership), false)
  })
}

test('旧 groupGone 不能覆盖尚未确认 reap 的准确资源状态', () => {
  assert.equal(ownershipStopped({ closed: true, groupGone: true, externalTermination: { stopped: false } }), false)
  assert.equal(ownershipStopped({ closed: true, groupGone: true, externalTermination: { stopped: true } }), true)
})

test('最终摘要与实际解析共用相同 Buffer，修改任一已审核字节必须失败', async (t) => {
  const value = await fixture(t)
  const session = { id: 's', directory: path.dirname(path.dirname(value.file)) }
  const snapshot = readReceiptSnapshot(session, { final: true })
  const seal = receiptSeal(new Map(snapshot.map(item => [item.name, item])))
  verifyReceiptSeal(snapshot, seal)
  assert.equal(JSON.parse(snapshot[0].bytes.toString().trim()).kind, 'ready')
  snapshot[0].bytes[0] = 0
  assert.throws(() => verifyReceiptSeal(snapshot, seal), /收据发生变化/)
})
