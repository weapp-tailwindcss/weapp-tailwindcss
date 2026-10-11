import type { CompilationDiagnosticEvent, CompilationEventListener } from './events'

export type AdapterCapability = 'compilerHost' | 'sourceCandidates' | 'cssGeneration' | 'assetEmission' | 'watchUpdate' | 'diagnostics'

export interface AdapterCapabilities {
  adapter: string
  version: string
  capabilities: readonly AdapterCapability[]
}

/** 为适配器声明能力，便于统一契约检查并保持旧适配器兼容。 */
export function createAdapterCapabilities(adapter: string, overrides: Partial<AdapterCapabilities> = {}): AdapterCapabilities {
  return {
    adapter,
    version: '1.0',
    capabilities: ['compilerHost', 'sourceCandidates', 'cssGeneration', 'assetEmission', 'watchUpdate', 'diagnostics'],
    ...overrides,
  }
}

export const BUILTIN_ADAPTER_CAPABILITIES = {
  vite: createAdapterCapabilities('vite'),
  webpack: createAdapterCapabilities('webpack'),
  rspack: createAdapterCapabilities('rspack'),
  gulp: createAdapterCapabilities('gulp'),
} as const

export interface CompilerHost {
  readonly id: string
  readonly capabilities: AdapterCapabilities
  revision: number
  dispose: () => void
}

export interface SourceCandidateProvider { scan: (sourceId: string, source: string) => Promise<ReadonlySet<string>> | ReadonlySet<string> }
export interface CssGenerator { generate: (candidates: ReadonlySet<string>) => Promise<string> | string }
export interface AssetEmitter { emit: (assetId: string, content: string) => Promise<void> | void }
export interface WatchUpdateHandler { update: (sourceId: string, source: string) => Promise<void> | void }
export interface DiagnosticReporter { report: CompilationEventListener }

export function missingCapabilities(actual: AdapterCapabilities, required: readonly AdapterCapability[]): AdapterCapability[] {
  return required.filter(capability => !actual.capabilities.includes(capability))
}

export function createCapabilityDiagnostic(capabilities: AdapterCapabilities, required: readonly AdapterCapability[]): CompilationDiagnosticEvent | undefined {
  const missing = missingCapabilities(capabilities, required)
  if (missing.length === 0) {
    return undefined
  }
  return {
    schemaVersion: 1,
    type: 'diagnostic',
    timestamp: new Date().toISOString(),
    adapter: capabilities.adapter,
    phase: 'emit',
    error: { name: 'MissingCapability', message: `缺少能力: ${missing.join(', ')}` },
    evidence: missing,
  }
}
