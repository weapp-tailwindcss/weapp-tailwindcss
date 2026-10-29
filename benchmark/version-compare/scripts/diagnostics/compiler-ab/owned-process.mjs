import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

const owned = []
export const processOwnership = () => owned.map(item => ({ ...item, members: { ...item.members } }))

export function failureEvidence(error) {
  return {
    name: error.name, message: error.message, stack: error.stack, ownership: error.ownership, stderr: error.stderr,
    cause: error.cause ? failureEvidence(error.cause) : undefined,
    errors: error.errors?.map(failureEvidence),
  }
}

export const ownershipStopped = item => item.closed && item.groupGone && (!item.externalTermination || item.externalTermination.stopped === true)

export function assertProcessesStopped() {
  assert.ok(owned.every(ownershipStopped), '仍有未确认 close/reap 或精确 OS 停止边界的诊断进程，必须保留副本')
}

function remaining(deadline, now = Date.now) {
  const budget = deadline - now()
  assert.ok(budget > 0, '进程身份查询已耗尽阶段截止')
  return budget
}

function inspectGroup(pid, deadline) {
  const result = spawnSync('ps', ['-Ao', 'pid=,ppid=,pgid=,stat=,lstart='], {
    encoding: 'utf8', timeout: Math.max(1, Math.min(3000, remaining(deadline))), env: { ...process.env, LC_ALL: 'C' },
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, '无法确认诊断进程组状态')
  remaining(deadline)
  return result.stdout.split(/\r?\n/).flatMap((line) => {
    remaining(deadline)
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/)
    assert.ok(!line.trim() || match, '无法解析诊断进程组身份')
    if (!match || Number(match[3]) !== pid) return []
    let birth = match[5]
    if (process.platform === 'linux') {
      try {
        const stat = fs.readFileSync(path.join('/proc', match[1], 'stat'), 'utf8')
        const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)
        if (Number(fields[2]) !== pid) return []
        birth = fields[19]
        assert.match(birth, /^\d+$/)
      }
      catch (error) { if (error.code === 'ENOENT') return []; throw error }
    }
    return [{ pid: Number(match[1]), ppid: Number(match[2]), pgid: pid, state: match[4], birth }]
  })
}

export function registerMembers(state, rows) {
  let changed = true
  while (changed) {
    changed = false
    for (const row of rows) {
      if (state.members[row.pid] || row.pid === state.pid) continue
      const parent = rows.find(item => item.pid === row.ppid)
      if (parent && state.members[parent.pid] === parent.birth) {
        state.members[row.pid] = row.birth
        changed = true
      }
    }
  }
}

export function groupStatus(state, rows) {
  registerMembers(state, rows)
  const leader = rows.find(row => row.pid === state.pid)
  const live = rows.filter(row => !row.state.startsWith('Z'))
  const matching = live.filter(row => state.members[row.pid] === row.birth)
  // 原组仍有成员时，组长 PID 不能成为另一组的新组长；新出生身份可证明原组已消失。
  const reused = Boolean(leader && state.members[state.pid] && state.members[state.pid] !== leader.birth)
  return { gone: live.length === 0 || (reused && matching.length === 0), safeToSignal: !reused && matching.length > 0, reused, matching }
}

export async function pollGroup(state, deadline, { inspect = inspectGroup, now = Date.now, sleep = delay } = {}) {
  while (now() < deadline) {
    // 不在阶段尾部用几毫秒预算启动完整进程表查询。
    if (deadline - now() < 50) {
      await sleep(Math.max(0, deadline - now()))
      break
    }
    const status = groupStatus(state, inspect(state.pid, deadline))
    remaining(deadline, now)
    if (status.gone) return status
    await sleep(Math.min(25, deadline - now()))
  }
  return { gone: false, safeToSignal: false, deadlineExhausted: true }
}

function signalOwned(state, status, signal) {
  assert.ok(status.safeToSignal, '没有本轮出生身份匹配的存活成员，禁止发送进程组信号')
  try { process.kill(-state.pid, signal) }
  catch (error) { if (error.code !== 'ESRCH') throw error }
}

export async function stopGroup(state, dependencies = {}) {
  if (!state.pid) { state.groupGone = true; return }
  const inspect = dependencies.inspect ?? inspectGroup
  const now = dependencies.now ?? Date.now
  const signal = dependencies.signal ?? signalOwned
  for (const [name, duration] of [['SIGTERM', 1500], ['SIGKILL', 3000]]) {
    const deadline = now() + duration
    try {
      const status = groupStatus(state, inspect(state.pid, deadline))
      remaining(deadline, now)
      if (status.gone) { state.groupGone = true; return }
      assert.ok(status.safeToSignal, '组内仅有未登记身份，禁止推断其归属')
      const attempt = { issuedAt: now(), signal: name, pgid: state.pid, identities: status.matching.map(item => ({ ...item })), result: 'attempted' }
      ;(state.signalAttempts ??= []).push(attempt)
      try { signal(state, status, name); attempt.result = 'returned' }
      catch (error) { attempt.result = 'error'; attempt.error = String(error); throw error }
      const settled = await pollGroup(state, deadline, { ...dependencies, inspect, now })
      if (settled.gone) { state.groupGone = true; return }
    }
    catch (error) { state.cleanupErrors.push(error.stack ?? String(error)) }
  }
  state.cleanupErrors.push('终止截止内未确认本轮进程组消失；保留副本')
}

async function waitClose(state, deadline) {
  while (!state.closed && Date.now() < deadline) await delay(Math.min(25, deadline - Date.now()))
  return state.closed
}

export async function runOwned(executable, args, { cwd, env, stdio = 'inherit', timeoutMs = 600000, onSpawn, onPoll, onSettled } = {}) {
  assert.notEqual(process.platform, 'win32', '完整诊断限定 Linux；进程组 fixture 也支持 macOS')
  assert.ok(Number.isFinite(timeoutMs) && timeoutMs > 0)
  const expires = Date.now() + timeoutMs
  const child = spawn(executable, args, { cwd, env, stdio, detached: true })
  const state = { pid: child.pid, executable, args, cwd, members: {}, closed: false, groupGone: false, cleanupErrors: [], signalAttempts: [] }
  owned.push(state)
  let spawnError
  let closeValue
  const closed = new Promise((resolve) => {
    child.once('error', (error) => { spawnError = error })
    child.once('exit', (code, signal) => { state.exit = { code, signal, observedAt: Date.now() } })
    child.once('close', (code, signal) => { state.closed = true; state.closeAt = Date.now(); closeValue = { code, signal }; resolve(closeValue) })
  })
  let timer
  let monitor
  let interrupt
  const interrupted = new Promise(resolve => { interrupt = value => resolve(value) })
  const sigint = () => interrupt({ interrupted: 'SIGINT' })
  const sigterm = () => interrupt({ interrupted: 'SIGTERM' })
  process.once('SIGINT', sigint)
  process.once('SIGTERM', sigterm)
  let primary
  let outcome
  try {
    if (child.pid) {
      const rows = inspectGroup(child.pid, Math.min(expires, Date.now() + 3000))
      const leader = rows.find(row => row.pid === child.pid)
      if (leader) state.members[leader.pid] = leader.birth
      registerMembers(state, rows)
      monitor = setInterval(() => {
        if (Date.now() >= expires || state.closed) return
        try { registerMembers(state, inspectGroup(child.pid, Math.min(expires, Date.now() + 1000))); onPoll?.() }
        catch (error) { interrupt({ monitorError: error }) }
      }, 250)
    }
    onSpawn?.(child, state)
    outcome = await Promise.race([
      closed, interrupted,
      new Promise(resolve => { timer = setTimeout(() => resolve({ timeout: true }), Math.max(0, expires - Date.now())) }),
    ])
    if (spawnError) throw spawnError
    if (outcome.timeout) throw new Error(`命令超过固定 ${timeoutMs}ms 截止：${executable}`)
    if (outcome.interrupted) throw new Error(`命令被 ${outcome.interrupted} 中断：${executable}`)
    if (outcome.monitorError) throw outcome.monitorError
    if (outcome.code !== 0) throw new Error(`命令退出 ${outcome.code ?? outcome.signal}：${executable} ${args.join(' ')}`)
    await onSettled?.({ ...closeValue, pid: child.pid, observedAt: state.closeAt, exit: state.exit }, state)
  }
  catch (error) { primary = error }
  finally {
    clearTimeout(timer)
    clearInterval(monitor)
    process.removeListener('SIGINT', sigint)
    process.removeListener('SIGTERM', sigterm)
    await stopGroup(state)
    if (!await waitClose(state, Date.now() + 3000)) {
      state.cleanupErrors.push('诊断进程 close/reap 超过独立 3000ms 截止')
      child.stdout?.destroy(); child.stderr?.destroy(); child.stdin?.destroy(); child.unref()
    }
  }
  state.primaryError = primary?.stack ?? null
  state.result = closeValue ?? outcome
  if (primary || state.cleanupErrors.length) {
    const error = new AggregateError([...(primary ? [primary] : []), ...state.cleanupErrors.map(message => new Error(message))], `诊断命令失败：${executable}`, { cause: primary })
    error.ownership = { ...state }
    throw error
  }
  return { ...closeValue, pid: child.pid }
}
