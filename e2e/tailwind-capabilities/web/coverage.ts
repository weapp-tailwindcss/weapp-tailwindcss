import type { TailwindInventory } from '../inventory'
import type { BrowserEngine } from '../types'
import { autofillProbe } from '../web-autofill/fixtures'
import { contextWebProbes } from '../web-context/fixtures'
import { historyProbe } from '../web-history/fixtures'
import { lifecycleWebProbes } from '../web-lifecycle/fixtures'
import { nativeMediaProbe } from '../web-native-media/fixtures'
import { webProbes } from './probes'
import { variantRuntimeGaps } from './variants/gaps'

export interface WebRuntimeCoverage {
  featureId: string
  caseIds: string[]
  status: 'fixture-defined' | 'not-run'
  reason?: string
}

export function webRuntimeCoverage(inventory: TailwindInventory, engine: BrowserEngine): WebRuntimeCoverage[] {
  const probes: readonly { id: string, features: readonly string[] }[] = [...webProbes, ...contextWebProbes, ...lifecycleWebProbes, historyProbe, ...(engine === 'chromium' ? [nativeMediaProbe, autofillProbe] : [])]
  return [...inventory.utilities, ...inventory.variants].map((feature) => {
    const caseIds = probes.filter(probe => probe.features.includes(feature.id)).map(probe => `runtime/${probe.id}`)
    return {
      featureId: feature.id,
      caseIds,
      status: caseIds.length ? 'fixture-defined' : 'not-run',
      ...(!caseIds.length ? { reason: variantRuntimeGaps[feature.id] ?? '尚未提供此注册能力的独立运行时语义夹具；静态合法和产物生成不能替代实际运行证据。' } : {}),
    }
  })
}
