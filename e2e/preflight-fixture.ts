import type { ComputerUseEvidence } from '../scripts/e2e-preflight/computer-use'
import type { Check, Identity, PreflightReport, ProbeId } from '../scripts/e2e-preflight/types'
import { randomUUID } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PNG } from 'pngjs'
import { initialChecks, PreflightSession } from '../scripts/e2e-preflight/session'

export function fixtureIdentity(root: string): Identity {
  return { root, head: 'a'.repeat(40), source: 'b'.repeat(64), host: 'test-host', platform: process.platform, config: {} }
}

export function passingCheck(id: ProbeId): Check {
  return { id, status: 'passed', checkedAt: new Date().toISOString(), detail: '测试注入探针', remedy: '', evidence: [], binding: { command: 'test-command', version: '1', device: id, host: 'test-host', channel: 'stable', httpPort: '12345' } }
}

export async function fixtureSession(identity?: Identity) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wt-preflight-test-'))
  const report: PreflightReport = { schema: 'full-test-preflight/v1', runId: randomUUID(), identity: identity ?? fixtureIdentity(dir), createdAt: new Date(Date.now() - 1000).toISOString(), status: 'blocked', checks: initialChecks(), endpoint: 'http://127.0.0.1:12345', token: randomUUID(), challenge: randomUUID() }
  const session = new PreflightSession(report, path.join(dir, 'report.json'), dir, async id => passingCheck(id))
  await session.save()
  return { dir, report, session }
}

export async function computerEvidence(session: PreflightSession) {
  const { report, dir } = session
  session.interactionAt = new Date().toISOString()
  const screenshot = new PNG({ width: 20, height: 20 })
  screenshot.data.fill(255)
  await writeFile(path.join(dir, 'computer.png'), PNG.sync.write(screenshot))
  const observations: ComputerUseEvidence['observations'] = []
  for (const action of ['discover', 'read', 'screenshot', 'input', 'click', 'verify'] as const) {
    const toolCallId = `test-tool-${action}`
    const transcript = `${action}.txt`
    await writeFile(path.join(dir, transcript), `${toolCallId}\n${report.runId}\n合成测试工具输出，仅用于门禁回归，不作为设备验收证据。`)
    observations.push({ action, toolCallId, transcript })
  }
  const evidence: ComputerUseEvidence = { runId: report.runId, provider: 'test-provider', sessionId: 'test-session', observedAt: new Date().toISOString(), targetUrl: `${report.endpoint}/challenge/${report.challenge}`, screenshot: 'computer.png', observations }
  await writeFile(path.join(dir, 'computer-use.json'), JSON.stringify(evidence))
  return evidence
}
