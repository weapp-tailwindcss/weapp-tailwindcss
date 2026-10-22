import type { ReactNativeReport } from '../catalog'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { exampleRoot } from '../generation-input'
import { nativePhaseForRevision, nativeRuntimePhases } from '../phase-contract'
import { archiveHmrSnapshot, prepareMetroHmrObservation } from './evidence'

const require = createRequire(import.meta.url)
const { withMetroHmrObservation, request } = require('./config.cjs')

/** 合成协议只用于纯回归；归档实际观察器源码，消息明确保留 synthetic-unit 身份。 */
export async function writeHmrPhaseFixture(directory: string, report: ReactNativeReport, phaseRoot: string) {
  const output = path.join(phaseRoot, 'hmr-observation.json')
  if (report.platform === 'web') {
    await writeFile(output, JSON.stringify({ schemaVersion: 1, evidence: 'not-applicable', platform: 'web' }))
    return
  }
  const sessionFile = path.join(directory, 'runtime-session.json')
  const session = await readFile(sessionFile, 'utf8').then(JSON.parse).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    return { runId: report.runId, invocationId: 'synthetic-unit-hmr-invocation' }
  })
  if (session.runId !== report.runId) {
    throw new Error('合成 HMR session 与报告身份不符')
  }
  await writeFile(sessionFile, JSON.stringify(session))
  const identity = { runId: session.runId, invocationId: session.invocationId }
  const phase = nativePhaseForRevision(report.revision)
  if (phase.id === 'baseline') {
    const environment = await prepareMetroHmrObservation(path.resolve(exampleRoot, '../..'), directory, identity)
    const options = JSON.parse(environment.RN_METRO_HMR_ARCHIVE)
    const originalRequire = createRequire(options.utilitiesPath)
    const original = { type: 'sourceFile', filePath: originalRequire.resolve(request) }
    const config = withMetroHmrObservation({ projectRoot: exampleRoot }, environment)
    config.resolver.resolveRequest({ originModulePath: options.utilitiesPath, resolveRequest: () => original }, request, report.platform)
  }
  const records = nativeRuntimePhases.slice(0, nativeRuntimePhases.indexOf(phase) + 1).map((item, position) => ({
    sequence: position + 1,
    connectionId: 1,
    kind: 'message-received' as const,
    receivedAtMs: position,
    data: JSON.stringify({ type: 'update', body: { revisionId: `synthetic-unit-${item.id}`, isInitialUpdate: position === 0, added: [], modified: [], deleted: [] } }),
  }))
  await archiveHmrSnapshot(directory, report, { schemaVersion: 1, identity, boundary: 'original-metro-client-websocket', initialBundle: 'not-captured', evaluator: 'not-captured', connections: [{ id: 1, url: 'http://synthetic-unit.invalid/hot' }], records, errors: [] })
  await copyFile(path.join(directory, 'hmr-client', `${phase.id}.json`), output)
}
