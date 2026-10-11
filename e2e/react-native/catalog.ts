import type { CompatibilityCase } from '../../examples/react-lynx/src/compatibility/types'
import { createHash } from 'node:crypto'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'

export type ReactNativePlatform = 'android' | 'ios' | 'web'

export interface ReactNativeCaseResult {
  id: string
  status: 'supported' | 'unsupported'
  reason?: string
  warnings?: string[]
  checkpoints: Array<{ name: string, passed: boolean, actual?: string, expected?: string }>
}

export interface ReactNativeReport {
  schemaVersion: 1
  platform: ReactNativePlatform
  catalogHash: string
  verifiedAt: string
  versions: {
    tailwindcss: string
    expo: string
    reactNative: string
    compiler: string
  }
  environment: {
    deviceName: string
    osName: string
    osVersion: string
    runtimeIdentifier: string
    abi: string
    viewport: { width: number, height: number, pixelRatio: number }
  }
  results: ReactNativeCaseResult[]
}

export { compatibilityCases }
export type { CompatibilityCase }

export function catalogHash(cases: readonly CompatibilityCase[] = compatibilityCases) {
  return createHash('sha256')
    .update(cases.map(item => `${item.id}\u0000${item.className}\u0000${item.evidence}\u0000${item.probe}`).join('\n'))
    .digest('hex')
}

export const RN_CATALOG_HASH = catalogHash()
export const RN_VERSIONS = {
  tailwindcss: '4.3.3',
  expo: '54.0.37',
  reactNative: '0.81.5',
  compiler: '0.2.4',
} as const
