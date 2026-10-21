import type { IncomingMessage, ServerResponse } from 'node:http'
import type { NativeCaseReceipt, NativePairEvidence, NativeRuntimeIdentity, ReactNativePlatform, ReactNativeReport } from '../../examples/react-native-expo/src/compatibility/protocol'
import { Buffer } from 'node:buffer'
import { nativeFixtures } from '../../examples/react-native-expo/src/compatibility/protocol'
import { createNativeCaptureBudget } from './capture-budget'
import { assertRuntimeIdentity, runtimeIdentity, validateRuntimeIdentity, validateRuntimeInstallation } from './installation-evidence'

interface SemanticContext { runId: string, fixtureHash: string, catalogHash: string, versions: Record<string, string> }
interface ReportEnvelope { hmrMarker: string, cssHmrColor: string, report: ReactNativeReport }
interface ReporterOptions<Envelope> {
  clientToken: string
  revision: string
  platform: ReactNativePlatform
  complete?: (envelope: Envelope) => Promise<void>
}

class ProtocolRejection extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export function createSemanticReporter<Envelope extends ReportEnvelope = ReportEnvelope>(context: SemanticContext, capture: (pair: NativePairEvidence, cancelSignal: AbortSignal) => Promise<NativeCaseReceipt>, options: ReporterOptions<Envelope>) {
  const errors: Error[] = []
  const receipts = new Map<string, NativeCaseReceipt>()
  const completed = new Map<string, string>()
  const revisions = new Set([options.revision])
  let revision = options.revision
  let pending = false
  let runtimeInstanceId: string | undefined
  let phaseInstallation: NativeRuntimeIdentity | undefined
  const registeredCases = Object.values(nativeFixtures).reduce((count, fixture) => count + (fixture.phases?.length ?? 1), 0)
  let captureBudget = createNativeCaptureBudget(registeredCases)
  let previousCaptureElapsed = 0

  function assertReady() {
    if (errors.length) {
      throw new AggregateError(errors, 'React Native semantic evidence failed')
    }
  }

  function assertReceipts(report: ReactNativeReport) {
    assertReady()
    if (report.runId !== context.runId || report.platform !== options.platform || report.revision !== revision) {
      throw new ProtocolRejection(409, 'Stale React Native report identity')
    }
    try {
      validateRuntimeInstallation(report.runtimeInstallation)
      if (!phaseInstallation) {
        throw new Error('缺少本阶段截图的实际安装身份')
      }
      assertRuntimeIdentity(report.runtimeInstallation, phaseInstallation)
      for (const receipt of report.receipts) {
        assertRuntimeIdentity(receipt.runtimeInstallation, phaseInstallation)
      }
    }
    catch (error) { throw new ProtocolRejection(409, String(error)) }
    for (const receipt of report.receipts) {
      const captured = receipts.get(`${report.revision}:${receipt.id}:${receipt.phase}`)
      if (!captured || JSON.stringify(captured) !== JSON.stringify(receipt)) {
        throw new ProtocolRejection(409, `Missing host screenshot receipt: ${receipt.id}:${receipt.phase}`)
      }
    }
  }

  async function accept(url: string, body: string, response: ServerResponse) {
    const payload = JSON.parse(body)
    if (url === '/report') {
      const envelope = payload as Envelope
      assertReceipts(envelope.report)
      if (`${envelope.hmrMarker}-${envelope.cssHmrColor.replace('#', '')}` !== revision) {
        throw new ProtocolRejection(409, 'Stale React Native report markers')
      }
      const identity = JSON.stringify(envelope.report)
      const existing = completed.get(revision)
      if (existing !== undefined) {
        if (existing !== identity) {
          throw new ProtocolRejection(409, 'Conflicting React Native report revision')
        }
        response.writeHead(204).end()
        return
      }
      if (pending) {
        throw new ProtocolRejection(409, 'Native semantic capture is already pending')
      }
      pending = true
      try {
        await options.complete?.(envelope)
        completed.set(revision, identity)
      }
      finally { pending = false }
      response.writeHead(204).end()
      return
    }
    if (payload.runId !== context.runId || payload.revision !== revision || completed.has(revision)) {
      throw new ProtocolRejection(409, 'Stale native semantic revision')
    }
    if (url === '/error') {
      throw new Error(String(payload.message))
    }
    const pair = payload as NativePairEvidence
    const fixture = nativeFixtures[pair.id]
    const phases: readonly string[] = fixture?.phases ?? ['default']
    if (pair.platform !== options.platform || !fixture || !phases.includes(pair.phase)) {
      throw new ProtocolRejection(409, 'Unknown native semantic case or platform')
    }
    const key = `${pair.revision}:${pair.id}:${pair.phase}`
    if (pending || receipts.has(key)) {
      throw new ProtocolRejection(409, 'Duplicate or concurrent native semantic capture')
    }
    try {
      validateRuntimeIdentity(pair.runtimeInstallation)
      if (runtimeInstanceId && pair.runtimeInstallation.runtimeInstanceId !== runtimeInstanceId) {
        throw new Error('React Native HMR 运行实例改变，不能由整包刷新代替')
      }
      if (phaseInstallation) {
        assertRuntimeIdentity(pair.runtimeInstallation, phaseInstallation)
      }
    }
    catch (error) { throw new ProtocolRejection(409, String(error)) }
    runtimeInstanceId ??= pair.runtimeInstallation.runtimeInstanceId
    phaseInstallation ??= runtimeIdentity(pair.runtimeInstallation)
    pending = true
    try {
      const receipt = await captureBudget.capture(cancelSignal => capture(pair, cancelSignal))
      assertRuntimeIdentity(receipt.runtimeInstallation, pair.runtimeInstallation)
      if (receipt.runId !== pair.runId || receipt.id !== pair.id || receipt.phase !== pair.phase) {
        throw new Error('Native host returned a mismatched receipt')
      }
      receipts.set(key, receipt)
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(receipt))
    }
    finally { pending = false }
  }

  return {
    handle(request: IncomingMessage, response: ServerResponse) {
      const url = request.url ?? ''
      if (!(url === '/context' && request.method === 'GET') && !(request.method === 'POST' && ['/case', '/error', '/report'].includes(url))) {
        return false
      }
      // capability 只注入本轮所属的页面或原生进程，公开 context 不能授予客户端身份。
      if (request.headers['x-rn-e2e-client'] !== options.clientToken) {
        response.writeHead(401).end('Unknown native evidence client')
        return true
      }
      if (url === '/context') {
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...context, revision }))
        return true
      }
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(Buffer.from(chunk)))
      request.on('end', () => {
        void accept(url, Buffer.concat(chunks).toString('utf8'), response).catch((error) => {
          if (!(error instanceof ProtocolRejection)) {
            errors.push(error instanceof Error ? error : new Error(String(error)))
          }
          response.writeHead(error instanceof ProtocolRejection ? error.status : 500).end(String(error))
        })
      })
      return true
    },
    setRevision(next: string) {
      if (pending || revisions.has(next)) {
        throw new Error('Cannot replace a pending or previously used native revision')
      }
      revision = next
      phaseInstallation = undefined
      revisions.add(next)
      previousCaptureElapsed += captureBudget.elapsed()
      captureBudget = createNativeCaptureBudget(registeredCases)
    },
    captureElapsed: () => previousCaptureElapsed + captureBudget.elapsed(),
    assertReady,
    assertReceipts,
  }
}
