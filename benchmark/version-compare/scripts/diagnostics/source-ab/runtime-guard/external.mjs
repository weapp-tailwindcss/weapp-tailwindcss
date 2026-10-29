import assert from 'node:assert/strict'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import linux from './linux.cjs'
import { receiptRecords, receiptSeal } from './receipts.mjs'
export { receiptRecords } from './receipts.mjs'

/** 在控制器中独立读取 Linux 活身份；不会改变业务引用或关闭顺序。 */
export function createTerminationObserver(session, dependencies = {}) {
  const read = dependencies.read ?? linux.readEntity
  const now = dependencies.now ?? Date.now
  const sleep = dependencies.sleep ?? delay
  const platform = dependencies.platform ?? process.platform
  const targets = new Map()
  const history = new Map()
  const errors = []
  let rootPid
  let rootClose
  let ownership
  let phase = 'created'
  let deadline
  let required = new Set(['root'])
  let firstError
  let result
  function errorEvidence(error) { return { name: error.name, message: error.message, code: error.code, stack: error.stack } }
  function failed(error) {
    if (!firstError) { firstError = error; errors.push({ phase, at: now(), ...errorEvidence(error) }) }
    phase = 'failed'
    if (ownership?.externalTermination) ownership.externalTermination = { stopped: false, phase, error: errorEvidence(firstError) }
    return error
  }
  function guarded(action) {
    if (firstError) throw firstError
    try { return action() }
    catch (error) { throw failed(error) }
  }
  function snapshot() {
    return {
      schemaVersion: 1, session: session.id, rootPid, rootClose, deadline, phase,
      available: Boolean(result) && !firstError, partial: !result || Boolean(firstError),
      beforeCleanup: Boolean(rootClose), ...(result ?? {}),
      targets: structuredClone([...targets.values()]), required: [...required], receipts: receiptSeal(history),
      controllerSignals: ownership ? structuredClone(ownership.signalAttempts) : null,
      observationErrors: [...errors], primaryError: firstError && errorEvidence(firstError),
    }
  }
  function add(key, expected, details) {
    if (!expected) return
    const prior = targets.get(key)
    if (prior) assert.deepEqual(prior.expected, expected, '外部观察目标出生身份被替换')
    else targets.set(key, { key, ...details, expected, observations: [] })
  }
  function observe(target) {
    const at = now()
    let actual
    try { actual = read(target.expected.pid, target.expected.tid, { executable: !target.firstSeen, hashExecutable: !target.firstSeen && target.kind === 'native' }) }
    catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error
      // exe/cmdline 的缺席不等于 task 消失；必须独立复查 stat。
      try {
        actual = read(target.expected.pid, target.expected.tid)
        if (linux.sameEntity(actual, target.expected) && actual.state !== 'Z') throw error
      }
      catch (caught) { if (caught !== error && ['ENOENT', 'ESRCH'].includes(caught.code)) actual = undefined; else throw caught }
    }
    let state = 'absent'
    if (actual && actual.bootId !== target.expected.bootId) throw new Error('外部观察的 Linux boot 身份改变')
    if (actual && linux.sameEntity(actual, target.expected)) {
      state = actual.state === 'Z' ? 'zombie' : 'alive'
      if (!target.firstSeen && state === 'alive') {
        assert.equal(actual.executable, target.expected.executable, '外部观察实际执行文件不符')
        assert.deepEqual(actual.argv, target.expected.argv, '外部观察实际启动参数不符')
        assert.equal(actual.pgid, target.expected.pgid, '外部观察进程组身份不符')
        assert.equal(actual.ppid, target.expected.ppid, '外部观察父进程身份不符')
        if (target.kind === 'native') {
          assert.equal(actual.sha256, target.expected.sha256, '外部观察原生执行文件内容不符')
          assert.deepEqual(actual.executableIdentity, target.expected.executableIdentity, '外部观察原生可执行映像身份不符')
        }
        target.firstSeen = { at, identity: actual }
      }
      if (state === 'alive') target.lastSeen = { at, identity: actual }
    }
    else if (actual) state = 'reused'
    if (!target.firstGone && (state === 'absent' || state === 'reused')) target.firstGone = { at, state, replacement: actual }
    if (target.firstGone && ['alive', 'zombie'].includes(state)) throw new Error('已消失的出生身份再次出现')
    target.lastObserved = { at, state }
    if (target.observations.at(-1)?.state !== state) target.observations.push({ at, state })
  }
  function sample() {
    if (platform !== 'linux') throw new Error('外部停止证据仅支持固定 Linux 诊断')
    const records = receiptRecords(session, false, history)
    for (const entry of records) {
      if (entry.kind === 'ready' && entry.pid === rootPid) add(`isolate:${entry.isolate}`, entry.osIdentity, { kind: 'isolate', isolate: entry.isolate, threadId: entry.threadId })
      if (entry.kind === 'launch-start' && entry.osIdentity) add(`launch:${entry.launch}`, entry.osIdentity, { kind: 'native', launch: entry.launch, isolate: entry.isolate })
    }
    for (const target of targets.values()) observe(target)
    return records
  }
  return {
    start(pid, owner) {
      rootPid = pid
      ownership = owner
      if (ownership) ownership.externalTermination = { stopped: false, phase: 'starting' }
      phase = 'starting'
      guarded(() => {
        const expected = read(pid, pid, { executable: true })
        add('root', expected, { kind: 'root' })
        observe(targets.get('root'))
      })
      phase = 'collecting'
    },
    sample: () => guarded(sample),
    async finish(close, owner) {
      ownership = owner
      phase = 'finishing'
      rootClose = { ...close, observerStartedAt: now() }
      deadline = now() + 1000
      try {
        do {
          const records = guarded(sample)
          receiptRecords(session, true, history)
          const closes = new Set(records.filter(entry => entry.kind === 'launch-close').map(entry => entry.launch))
          const starts = records.filter(entry => entry.kind === 'launch-start' && !closes.has(entry.launch))
          required = new Set(['root'])
          for (const start of starts) {
            if (start.osIdentity) required.add(`launch:${start.launch}`)
            else {
              const child = records.find(entry => entry.kind === 'ready' && entry.pid === start.targetPid && entry.threadId === start.targetThreadId)
              if (child) required.add(`isolate:${child.isolate}`)
            }
          }
          if ([...required].every(key => targets.get(key)?.firstGone)) break
          if (now() >= deadline) break
          await sleep(Math.min(25, deadline - now()))
        } while (now() <= deadline)
        const unconfirmed = [...required].filter(key => !targets.get(key)?.firstSeen || !targets.get(key)?.firstGone)
        ownership.externalTermination = { stopped: unconfirmed.length === 0 && now() <= deadline, phase: 'finished', unconfirmed }
        assert.ok(ownership.externalTermination.stopped, `外部停止未在固定 1000ms 截止内确认：${unconfirmed.join(', ')}`)
        phase = 'finished'
        result = { finishedAt: now(), confirmationDurationMs: now() - rootClose.observerStartedAt }
        return snapshot()
      }
      catch (error) { throw failed(error) }
    },
    evidence: snapshot,
  }
}
