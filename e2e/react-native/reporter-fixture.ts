import type { NativeCaseReceipt, NativePairEvidence } from '../../examples/react-native-expo/src/compatibility/protocol'
import { createServer } from 'node:http'
import { vi } from 'vitest'
import { syntheticRuntimeInstallation } from './installation-fixture'
import { createSemanticReporter } from './semantic-reporter'

export const revision = 'rn-hmr-baseline-10b981'
export const headers = { 'x-rn-e2e-client': 'owned-client', 'content-type': 'application/json' }

export function pair(overrides: Partial<NativePairEvidence> = {}): NativePairEvidence {
  const rect = { x: 0, y: 0, width: 40, height: 40 }
  return {
    runtimeInstallation: syntheticRuntimeInstallation(),
    runId: 'run',
    revision,
    platform: 'web',
    id: 'background-color',
    phase: 'default',
    probe: rect,
    reference: rect,
    target: rect,
    referenceTarget: rect,
    control: rect,
    controlTarget: rect,
    viewport: { width: 402, height: 874, pixelRatio: 1 },
    ...overrides,
  }
}

export function receipt(input: NativePairEvidence): NativeCaseReceipt {
  return { runtimeInstallation: input.runtimeInstallation, runId: input.runId, id: input.id, phase: input.phase, checkpoints: [], artifact: { name: 'owned.png', sha256: 'a'.repeat(64), byteLength: 1 }, capture: { version: 1, timeoutMs: 10_000, frames: [] } }
}

export async function withReporter(action: (session: {
  endpoint: string
  reporter: ReturnType<typeof createSemanticReporter>
  capture: ReturnType<typeof vi.fn<(input: NativePairEvidence) => Promise<NativeCaseReceipt>>>
  complete: ReturnType<typeof vi.fn<() => Promise<void>>>
  diagnostic: ReturnType<typeof vi.fn<(value: unknown) => Promise<void>>>
  post: (route: string, value: unknown, client?: string) => Promise<Response>
}) => Promise<void>, publication?: (signal: AbortSignal) => Promise<NativePairEvidence['runtimeInstallation']['publication']>) {
  const diagnostic = vi.fn(async (_value: unknown) => {})
  const capture = vi.fn(async (input: NativePairEvidence) => receipt(input))
  const complete = vi.fn(async () => {})
  const reporter = createSemanticReporter({ runId: 'run', fixtureHash: 'fixture', catalogHash: 'catalog', versions: {} }, capture, { clientToken: 'owned-client', revision, platform: 'web', complete, publication, diagnostic })
  const server = createServer((request, response) => {
    if (!reporter.handle(request, response)) {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Missing test reporter port')
    }
    const endpoint = `http://127.0.0.1:${address.port}`
    await action({ endpoint, reporter, capture, complete, diagnostic, post: (route, value, client = 'owned-client') => fetch(`${endpoint}${route}`, { method: 'POST', headers: { ...headers, 'x-rn-e2e-client': client }, body: JSON.stringify(value) }) })
  }
  finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
