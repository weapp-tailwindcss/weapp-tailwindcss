import type { HmrObservationSnapshot } from '../examples/react-native-expo/src/compatibility/hmr-observation.cjs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { validateHmrSnapshot, validateNativeHmrObservations } from './react-native/hmr-observation/evidence'
import { writeHmrPhaseFixture } from './react-native/hmr-observation/fixture'
import { syntheticRuntimeInstallation } from './react-native/installation-fixture'
import { nativeRuntimePhases } from './react-native/phase-contract'

const identity = { runId: 'owned-run', invocationId: 'owned-invocation' }
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
const update = { type: 'update', body: { revisionId: 'graph-revision', isInitialUpdate: false, added: [], modified: [{ module: [7, 'code'], sourceURL: 'http://metro/source.bundle', sourceMappingURL: 'http://metro/source.map' }], deleted: ['7'] } }
function snapshot(): HmrObservationSnapshot {
  return { schemaVersion: 1, identity, boundary: 'original-metro-client-websocket', initialBundle: 'not-captured', evaluator: 'not-captured', connections: [{ id: 1, url: 'wss://metro/hot?platform=ios' }], records: [{ sequence: 1, connectionId: 1, receivedAtMs: 123, kind: 'message-received', data: JSON.stringify(update) }], errors: [] }
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rn-hmr-observation-'))
  roots.push(root)
  await writeFile(path.join(root, 'runtime-session.json'), JSON.stringify(identity))
  for (const phase of nativeRuntimePhases) {
    const report = { runId: identity.runId, revision: phase.revision, platform: 'ios', runtimeInstallation: syntheticRuntimeInstallation('{"rules":{}}', `synthetic-${phase.id}`) } as any
    const phaseRoot = path.join(root, 'phases', phase.id)
    await mkdir(phaseRoot, { recursive: true })
    await writeFile(path.join(phaseRoot, 'report.json'), JSON.stringify(report))
    await writeHmrPhaseFixture(root, report, phaseRoot)
  }
  return root
}

describe('HMR 完成时观察独立重放', () => {
  it.each(['http:', 'https:', 'ws:', 'wss:'])('保留 RN 原客户端构造URL的协议：%s', (protocol) => {
    const s = snapshot()
    s.connections[0]!.url = `${protocol}//metro/hot`
    expect(() => validateHmrSnapshot(s, identity)).not.toThrow()
  })
  it('重读原始JSON并保留带类型ID、deleted、revision及代码，接收不升级为执行', () => {
    const messages = validateHmrSnapshot(snapshot(), identity)
    expect(messages[0]!.message.body).toEqual(update.body)
    expect(messages[0]!.message.body.modified[0].module[0]).toBe(7)
    expect(messages[0]!.message.body.deleted[0]).toBe('7')
  })

  it.each([
    ['旧会话', (s: any) => { s.identity = { ...identity, invocationId: 'old' } }],
    ['宿主快照冒充', (s: any) => { s.boundary = 'metro-response-before-content-encoding' }],
    ['截断原件', (s: any) => { s.errors.push('budget exceeded') }],
    ['序号断裂', (s: any) => { s.records[0].sequence = 2 }],
    ['错连接', (s: any) => { s.records[0].connectionId = 2 }],
    ['无deleted', (s: any) => {
      const d = JSON.parse(s.records[0].data)
      delete d.body.deleted
      s.records[0].data = JSON.stringify(d)
    }],
    ['无revision', (s: any) => {
      const d = JSON.parse(s.records[0].data)
      delete d.body.revisionId
      s.records[0].data = JSON.stringify(d)
    }],
    ['无原始代码', (s: any) => {
      const d = JSON.parse(s.records[0].data)
      d.body.modified[0].module.pop()
      s.records[0].data = JSON.stringify(d)
    }],
    ['执行声明', (s: any) => { s.evaluator = 'captured' }],
  ])('拒绝%s', (_name, mutate) => {
    const s = snapshot()
    mutate(s)
    expect(() => validateHmrSnapshot(s, identity)).toThrow()
  })

  it('三个阶段只增加并列观察，仍明确保留初始bundle、执行及因果链缺口', async () => {
    const root = await fixture()
    const result = await validateNativeHmrObservations(root, 'ios')
    expect(result.phases).toHaveLength(3)
    expect(result).toMatchObject({ initialBundle: 'not-captured', evaluator: 'not-captured', modulePhaseCausality: 'not-captured' })
  })

  it.each(['message-prefix', 'runtime-reload', 'resolver-bytes', 'missing-phase', 'installation'])('即使改写摘要也拒绝%s', async (kind) => {
    const root = await fixture()
    const file = path.join(root, 'hmr-client', 'tsx-hmr.json')
    const record = JSON.parse(await readFile(file, 'utf8'))
    if (kind === 'message-prefix') {
      record.snapshot.records[0].data = '{"type":"update-done"}'
    }
    if (kind === 'runtime-reload') {
      record.installation.runtimeInstanceId = 'different-runtime-realm-identity'
      const reportFile = path.join(root, 'phases', 'tsx-hmr', 'report.json')
      const report = JSON.parse(await readFile(reportFile, 'utf8'))
      report.runtimeInstallation = record.installation
      await writeFile(reportFile, JSON.stringify(report))
    }
    if (kind === 'installation') {
      record.installation.manifestJson = '{"rules":{"forged":[]}}'
    }
    await writeFile(file, JSON.stringify(record))
    if (kind === 'resolver-bytes') {
      await writeFile(path.join(root, 'hmr-client', 'ios-client-source.js'), 'other implementation')
    }
    if (kind === 'missing-phase') {
      await rm(path.join(root, 'hmr-client', 'css-hmr.json'))
    }
    await expect(validateNativeHmrObservations(root, 'ios')).rejects.toThrow()
  })
})
