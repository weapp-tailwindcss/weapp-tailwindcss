import type { TailwindInventory } from '../inventory'
import { webProbes } from './probes'

export interface WebRuntimeCoverage {
  featureId: string
  caseIds: string[]
  status: 'fixture-defined' | 'not-run'
  reason?: string
}

export function webRuntimeCoverage(inventory: TailwindInventory): WebRuntimeCoverage[] {
  return [...inventory.utilities, ...inventory.variants].map((feature) => {
    const caseIds = webProbes.filter(probe => probe.features.includes(feature.id)).map(probe => `runtime/${probe.id}`)
    return {
      featureId: feature.id,
      caseIds,
      status: caseIds.length ? 'fixture-defined' : 'not-run',
      ...(!caseIds.length ? { reason: '尚未提供此注册能力的独立运行时语义夹具；静态合法和产物生成不能替代实际运行证据。' } : {}),
    }
  })
}
