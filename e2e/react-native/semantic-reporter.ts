import type { IncomingMessage, ServerResponse } from 'node:http'
import type { NativeCaseReceipt, NativePairEvidence, ReactNativeReport } from '../../examples/react-native-expo/src/compatibility/protocol'
import { Buffer } from 'node:buffer'
import { nativeFixtures } from '../../examples/react-native-expo/src/compatibility/protocol'

interface SemanticContext { runId: string, fixtureHash: string, catalogHash: string, versions: Record<string, string> }

export function createSemanticReporter(context: SemanticContext, capture: (pair: NativePairEvidence) => Promise<NativeCaseReceipt>) {
  const errors: Error[] = []
  const receipts = new Map<string, NativeCaseReceipt>()
  return {
    handle(request: IncomingMessage, response: ServerResponse) {
      if (request.url === '/context' && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(context))
        return true
      }
      if (request.method !== 'POST' || !['/case', '/error'].includes(request.url ?? '')) {
        return false
      }
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(Buffer.from(chunk)))
      request.on('end', () => {
        void (async () => {
          const body = Buffer.concat(chunks).toString('utf8')
          if (request.url === '/error') {
            throw new Error(body)
          }
          const pair = JSON.parse(body) as NativePairEvidence
          const fixture = nativeFixtures[pair.id]
          const phases: readonly string[] = fixture?.phases ?? ['default']
          if (pair.runId !== context.runId || !fixture || !phases.includes(pair.phase)) {
            throw new Error('Stale or unknown native semantic case')
          }
          const receipt = await capture(pair)
          receipts.set(`${pair.revision}:${pair.id}:${pair.phase}`, receipt)
          response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(receipt))
        })().catch((error) => {
          errors.push(error instanceof Error ? error : new Error(String(error)))
          response.writeHead(500).end(String(error))
        })
      })
      return true
    },
    assertReady() {
      if (errors.length) {
        throw new AggregateError(errors, 'React Native semantic evidence failed')
      }
    },
    assertReceipts(report: ReactNativeReport) {
      this.assertReady()
      if (report.runId !== context.runId) {
        throw new Error('Stale React Native report run')
      }
      for (const receipt of report.receipts) {
        const captured = receipts.get(`${report.revision}:${receipt.id}:${receipt.phase}`)
        if (!captured || JSON.stringify(captured) !== JSON.stringify(receipt)) {
          throw new Error(`Missing host screenshot receipt: ${receipt.id}:${receipt.phase}`)
        }
      }
    },
  }
}
