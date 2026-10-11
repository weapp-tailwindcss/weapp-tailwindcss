import type { Check, Identity, PreflightReport, ProbeContext, ProbeId } from './types'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { validateComputerUse } from './computer-use'
import { assertIdentity, writeReport } from './io'
import { runProbe } from './probe'
import { maxAgeMs, remedies, requiredCheckIds } from './types'

type Probe = (id: ProbeId, context: ProbeContext, signal?: AbortSignal) => Promise<Check>

export class PreflightSession {
  interactionAt?: string
  private busy = false
  private lease?: string
  private controller = new AbortController()
  private workers = new Set<Promise<Check>>()

  async cancel() {
    this.controller.abort()
    await Promise.allSettled(this.workers)
  }

  constructor(readonly report: PreflightReport, readonly file: string, readonly dir: string, private probe: Probe = runProbe) {}

  async save() {
    await writeReport(this.file, this.report)
  }

  async exclusive<T>(action: () => Promise<T>) {
    if (this.busy) {
      throw new Error('预检正在执行，不能并发验证或领取。')
    }
    this.busy = true
    try {
      return await action()
    }
    finally {
      this.busy = false
    }
  }

  async probes(ids: ProbeId[], phase: ProbeContext['phase']) {
    for (const id of ids) {
      this.controller.signal.throwIfAborted()
      const previous = this.report.checks.find(check => check.id === id)!
      const pending = this.probe(id, {
        root: this.report.identity.root,
        dir: this.dir,
        runId: this.report.runId,
        url: `${this.report.endpoint}/challenge/${this.report.challenge}`,
        phase,
        binding: phase === 'prepare' ? undefined : previous.binding,
      }, this.controller.signal)
      this.workers.add(pending)
      const result = await pending.finally(() => this.workers.delete(pending))
      this.controller.signal.throwIfAborted()
      this.report.checks[this.report.checks.indexOf(previous)] = result
      if (result.status !== 'passed') {
        this.report.status = 'blocked'
      }
      await this.save()
      process.stdout.write(`[preflight] ${id}: ${result.status} ${result.detail}\n`)
      // 存活检查在首个失败处停止；prepare 的剩余探针仅用于一次性有界诊断。
      if (phase === 'live' && result.status !== 'passed') {
        throw new Error(`${id} 已阻断：${result.detail}\n${result.remedy}`)
      }
    }
  }

  assertReady(now = Date.now()) {
    const time = Date.parse(this.report.verifiedAt ?? '')
    if (this.report.status !== 'ready' || !Number.isFinite(time) || time > now || now - time > maxAgeMs
      || requiredCheckIds(this.report.extended).some(id => !this.report.checks.some(check => check.id === id && check.status === 'passed'
        && Number.isFinite(Date.parse(check.checkedAt)) && Date.parse(check.checkedAt) <= now
        && now - Date.parse(check.checkedAt) <= maxAgeMs))) {
      throw new Error('预检未全部通过或超过 15 分钟；全面测试禁止启动。')
    }
  }

  async verify(identity: Identity) {
    return this.exclusive(async () => {
      assertIdentity(this.report.identity, identity)
      if (this.lease || this.report.status === 'finished') {
        throw new Error('本轮已被使用，必须重新 prepare。')
      }
      this.report.status = 'blocked'
      delete this.report.verifiedAt
      const check = this.report.checks.find(item => item.id === 'computer-use')!
      check.status = 'blocked'
      let computerVerified = false
      try {
        const result = await validateComputerUse(this.report, this.dir, this.interactionAt)
        Object.assign(check, { status: 'passed', checkedAt: result.evidence.observedAt, detail: '当前会话工具证据与本轮输入/点击回执一致。', evidence: result.files, binding: { provider: result.evidence.provider, session: result.evidence.sessionId } })
        computerVerified = true
        await this.probes(requiredCheckIds(this.report.extended).filter((id): id is ProbeId => id !== 'computer-use'), 'verify')
        this.controller.signal.throwIfAborted()
        this.report.verifiedAt = new Date().toISOString()
        this.report.status = 'ready'
        this.assertReady()
      }
      catch (error) {
        this.report.status = 'blocked'
        if (!computerVerified) {
          Object.assign(check, { status: 'blocked', checkedAt: new Date().toISOString(), detail: String(error) })
        }
        await this.save()
        throw error
      }
      await this.save()
      return this.report
    })
  }

  async claim(identity: Identity, consumer: string, extended = false) {
    return this.exclusive(async () => {
      if (this.lease) {
        throw new Error('预检报告已领取，不能重复使用。')
      }
      try {
        if (extended && this.report.extended !== true) {
          throw new Error('扩展流程必须先执行 pnpm e2e:preflight prepare --extended。')
        }
        assertIdentity(this.report.identity, identity)
        this.assertReady()
        // 领取前复查所有目标，避免通过验证后关闭设备仍启动构建。
        await this.probes(requiredCheckIds(this.report.extended).filter((id): id is ProbeId => id !== 'computer-use'), 'live')
        this.controller.signal.throwIfAborted()
        await validateComputerUse(this.report, this.dir, this.interactionAt)
        this.assertReady()
        this.lease = randomUUID()
        this.report.consumer = consumer
        this.report.status = 'running'
        await this.save()
        return { lease: this.lease, bindings: Object.fromEntries(this.report.checks.map(check => [check.id, check.binding])) }
      }
      catch (error) {
        this.report.status = 'blocked'
        delete this.report.verifiedAt
        this.report.interruption = String(error)
        await this.save()
        throw error
      }
    })
  }

  async check(identity: Identity, lease: string, ids: ProbeId[]) {
    return this.exclusive(async () => {
      assertIdentity(this.report.identity, identity)
      if (!this.lease || lease !== this.lease || this.report.status !== 'running') {
        throw new Error('测试会话已失效或阻断，禁止继续调度。')
      }
      if (ids.some(id => !requiredCheckIds(this.report.extended).includes(id))) {
        throw new Error('存活检查目标不属于本轮预检范围。')
      }
      await this.probes(ids, 'live')
    })
  }

  async finish(lease: string) {
    if (!this.lease || this.lease !== lease) {
      throw new Error('无权结束其他运行的预检会话。')
    }
    if (this.report.status !== 'blocked') {
      this.report.status = 'finished'
    }
    await this.save()
  }
}

export function initialChecks(extended = false): Check[] {
  return requiredCheckIds(extended).map(id => ({ id, status: 'not-run', checkedAt: '', detail: '尚未验证。', remedy: remedies[id], evidence: [] }))
}
