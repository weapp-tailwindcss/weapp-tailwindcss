import type { IncomingMessage, ServerResponse } from 'node:http'
import type { NativeCaseReceipt, NativePairEvidence, NativeRuntimeIdentity, NativeSemanticDiagnostic, ReactNativePlatform, ReactNativeReport } from '../../examples/react-native-expo/src/compatibility/protocol'
import { Buffer } from 'node:buffer'
import { nativeFixtures } from '../../examples/react-native-expo/src/compatibility/protocol'
import { createNativeCaptureBudget } from './capture-budget'
import { awaitCaptureCleanup } from './capture-cleanup'
import { assertRuntimeIdentity, runtimeIdentity, validateRuntimeIdentity, validateRuntimeInstallation } from './installation-evidence'
import { assertScrollTransition } from './scroll-sequence'

interface SemanticContext { runId: string, fixtureHash: string, catalogHash: string, versions: Record<string, string> }
interface ReportEnvelope { hmrMarker: string, cssHmrColor: string, report: ReactNativeReport }
interface ReporterOptions<Envelope> {
  clientToken: string
  revision: string
  platform: ReactNativePlatform
  complete?: (envelope: Envelope, signal: AbortSignal) => Promise<void>
  diagnostic?: (value: NativeSemanticDiagnostic, signal: AbortSignal) => Promise<void>
  publication?: (signal: AbortSignal) => Promise<NativeRuntimeIdentity['publication']>
}

class ProtocolRejection extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export function createSemanticReporter<Envelope extends ReportEnvelope = ReportEnvelope>(context: SemanticContext, capture: (pair: NativePairEvidence, cancelSignal: AbortSignal) => Promise<NativeCaseReceipt>, options: ReporterOptions<Envelope>) {
  const errors: Error[] = []
  const receipts = new Map<string, NativeCaseReceipt>()
  const scrolls = new Map<string, NativePairEvidence>()
  const diagnosticWrites = new Set<Promise<void>>()
  const diagnosticFailures: unknown[] = []
  const completed = new Map<string, string>()
  const revisions = new Set([options.revision])
  let revision = options.revision
  let pending = false
  let stopped = false
  const owner = new AbortController()
  let runtimeInstanceId: string | undefined
  let phaseInstallation: NativeRuntimeIdentity | undefined
  let previousPublication: string | undefined
  let expectedPublication: NativeRuntimeIdentity['publication'] | undefined
  const registeredCases = Object.values(nativeFixtures).reduce((count, fixture) => count + (fixture.phases?.length ?? 1), 0)
  let captureBudget = createNativeCaptureBudget(registeredCases)
  let previousCaptureElapsed = 0
  let reportCompletion: Promise<void> | undefined
  let reportFailure: { error: unknown } | undefined

  function assertReady() {
    if (errors.length) {
      throw new AggregateError(errors, 'React Native semantic evidence failed')
    }
  }

  async function saveDiagnostic(value: NativeSemanticDiagnostic) {
    const fixture = nativeFixtures[value.id]
    if (value.version !== 1 || value.evidence !== 'diagnostic-only' || !['scroll-client-failure', 'scroll-transition-rejected'].includes(value.kind)
      || value.runId !== context.runId || value.revision !== revision || value.platform !== options.platform
      || !fixture || !(fixture.phases ?? ['default']).includes(value.phase)) {
      throw new ProtocolRejection(409, 'Stale or unknown native diagnostic identity')
    }
    if (!phaseInstallation) {
      throw new ProtocolRejection(409, 'Diagnostic cannot initialize the native installation')
    }
    try {
      validateRuntimeIdentity(value.runtimeInstallation)
      assertRuntimeIdentity(value.runtimeInstallation, phaseInstallation)
    }
    catch (error) {
      throw new ProtocolRejection(409, String(error))
    }
    // 诊断写入纳入 owner 收尾；任何迟到失败都不能被归档丢弃。
    const write = Promise.resolve().then(() => options.diagnostic?.(structuredClone(value), owner.signal))
    diagnosticWrites.add(write)
    void write.then(() => diagnosticWrites.delete(write), (error) => {
      diagnosticFailures.push(error)
      diagnosticWrites.delete(write)
    })
    try {
      await write
    }
    catch (error) {
      throw new AggregateError([new Error(value.message), error], 'Native semantic failure and diagnostic write failed')
    }
    if (stopped) {
      throw new ProtocolRejection(409, 'Native diagnostic owner is closing')
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
    catch (error) {
      throw new ProtocolRejection(409, String(error))
    }
    for (const receipt of report.receipts) {
      const captured = receipts.get(`${report.revision}:${receipt.id}:${receipt.phase}`)
      if (!captured || JSON.stringify(captured) !== JSON.stringify(receipt)) {
        throw new ProtocolRejection(409, `Missing host screenshot receipt: ${receipt.id}:${receipt.phase}`)
      }
    }
  }

  async function accept(url: string, body: string, response: ServerResponse) {
    if (stopped) {
      throw new ProtocolRejection(409, 'Native evidence owner is closing')
    }
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
      if (pending || captureBudget.pending()) {
        throw new ProtocolRejection(409, 'Native semantic capture is already pending')
      }
      pending = true
      try {
        const work = Promise.resolve().then(async () => {
          if (envelope.report.failureDiagnostic) {
            await saveDiagnostic(envelope.report.failureDiagnostic)
          }
          await options.complete?.(envelope, owner.signal)
        })
        reportCompletion = work.then(() => {}, (error) => {
          reportFailure = { error }
        })
        await work
        if (stopped) {
          throw new ProtocolRejection(409, 'Native evidence owner is closing')
        }
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
      if (payload.diagnostic) {
        await saveDiagnostic(payload.diagnostic)
      }
      throw new Error(String(payload.message))
    }
    const pair = payload as NativePairEvidence
    const fixture = nativeFixtures[pair.id]
    const phases: readonly string[] = fixture?.phases ?? ['default']
    if (pair.platform !== options.platform || !fixture || !phases.includes(pair.phase)) {
      throw new ProtocolRejection(409, 'Unknown native semantic case or platform')
    }
    const key = `${pair.revision}:${pair.id}:${pair.phase}`
    if (pending || captureBudget.pending() || receipts.has(key)) {
      throw new ProtocolRejection(409, 'Duplicate or concurrent native semantic capture')
    }
    try {
      validateRuntimeIdentity(pair.runtimeInstallation)
      if (options.publication && (!expectedPublication || JSON.stringify(pair.runtimeInstallation.publication) !== JSON.stringify(expectedPublication))) {
        throw new Error('React Native 实际安装尚未匹配宿主阶段 publication fence')
      }
      if (runtimeInstanceId && pair.runtimeInstallation.runtimeInstanceId !== runtimeInstanceId) {
        throw new Error('React Native HMR 运行实例改变，不能由整包刷新代替')
      }
      if (phaseInstallation) {
        assertRuntimeIdentity(pair.runtimeInstallation, phaseInstallation)
      }
    }
    catch (error) {
      throw new ProtocolRejection(409, String(error))
    }
    runtimeInstanceId ??= pair.runtimeInstallation.runtimeInstanceId
    phaseInstallation ??= runtimeIdentity(pair.runtimeInstallation)
    pending = true
    try {
      const scrollKey = `${pair.revision}:${pair.id}`
      if (pair.phase.startsWith('scroll-')) {
        try {
          assertScrollTransition(pair, scrolls.get(scrollKey))
        }
        catch (error) {
          const diagnostic: NativeSemanticDiagnostic = { version: 1, evidence: 'diagnostic-only', kind: 'scroll-transition-rejected', runId: pair.runId, revision: pair.revision, platform: pair.platform, runtimeInstallation: pair.runtimeInstallation, id: pair.id, phase: pair.phase, message: String(error), observed: pair }
          try {
            await saveDiagnostic(diagnostic)
          }
          catch (writeError) {
            throw new AggregateError([error, writeError], 'Native transition and diagnostic write failed')
          }
          throw error
        }
      }
      const receipt = await captureBudget.capture(cancelSignal => capture(pair, cancelSignal))
      assertRuntimeIdentity(receipt.runtimeInstallation, pair.runtimeInstallation)
      if (receipt.runId !== pair.runId || receipt.id !== pair.id || receipt.phase !== pair.phase) {
        throw new Error('Native host returned a mismatched receipt')
      }
      receipts.set(key, receipt)
      if (pair.scroll) {
        scrolls.set(scrollKey, structuredClone(pair))
      }
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
      if (stopped) {
        response.writeHead(409).end('Native evidence owner is closing')
        return true
      }
      if (url === '/context') {
        const requestedRevision = revision
        void (async () => {
          const publication = phaseInstallation?.publication ?? await options.publication?.(owner.signal)
          if (stopped || revision !== requestedRevision) {
            response.writeHead(409).end('Native context revision changed')
            return
          }
          if (options.publication && (!publication || publication.revision === previousPublication)) {
            response.writeHead(425).end('Native phase publication is pending')
            return
          }
          expectedPublication = publication
          response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...context, revision, ...(publication ? { publication } : {}) }))
        })().catch((error) => {
          if (stopped || revision !== requestedRevision) {
            response.writeHead(409).end('Native context revision changed')
            return
          }
          errors.push(error instanceof Error ? error : new Error(String(error)))
          response.writeHead(500).end(String(error))
        })
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
      if (stopped || pending || diagnosticWrites.size > 0 || captureBudget.pending() || revisions.has(next)) {
        throw new Error('Cannot replace a pending or previously used native revision')
      }
      revision = next
      previousPublication = phaseInstallation?.publication.revision
      expectedPublication = undefined
      phaseInstallation = undefined
      scrolls.clear()
      revisions.add(next)
      previousCaptureElapsed += captureBudget.elapsed()
      captureBudget = createNativeCaptureBudget(registeredCases)
    },
    captureElapsed: () => previousCaptureElapsed + captureBudget.elapsed(),
    capturePending: () => pending || diagnosticWrites.size > 0 || captureBudget.pending(),
    stop() {
      stopped = true
      owner.abort(new Error('Native reporter owner is closing'))
      captureBudget.stop()
    },
    async drain() {
      const outcomes = await Promise.allSettled([captureBudget.drain(), awaitCaptureCleanup(reportCompletion ?? Promise.resolve(), 'Native report write'), ...[...diagnosticWrites].map(write => awaitCaptureCleanup(write, 'Native diagnostic write'))])
      const failures = outcomes.flatMap(outcome => outcome.status === 'rejected' ? [outcome.reason] : [])
      failures.push(...diagnosticFailures)
      if (reportFailure) {
        failures.push(reportFailure.error)
      }
      if (failures.length === 1) {
        throw failures[0]
      }
      if (failures.length) {
        throw new AggregateError(failures, 'Native evidence drain failed')
      }
    },
    assertReady,
    assertReceipts,
  }
}
