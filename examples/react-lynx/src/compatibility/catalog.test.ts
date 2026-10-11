import type { CompatibilityBaseline, StaticEvidenceReport } from './types'
import { describe, expect, it } from 'vitest'
import baselineJson from './baseline.json'
import { compatibilityCases } from './catalog'
import { officialFeatureManifest } from './manifest'
import staticEvidenceJson from './static-evidence.json'
import { featureFamilies } from './types'

describe('Lynx Tailwind CSS 4 compatibility catalog', () => {
  it('uses stable unique IDs and covers every official feature manifest entry', () => {
    const caseIds = compatibilityCases.map(item => item.id)
    const featureIds = officialFeatureManifest.map(item => `${item.family}:${item.id}`)
    expect(new Set(caseIds).size).toBe(caseIds.length)
    expect(new Set(featureIds).size).toBe(featureIds.length)
    expect(new Set(compatibilityCases.map(item => item.family))).toEqual(new Set(featureFamilies))
    for (const feature of officialFeatureManifest) {
      expect(caseIds, `${feature.family}:${feature.id} points to a missing case`).toContain(feature.caseId)
    }
  })

  it('keeps every runtime case observable and every candidate statically discoverable', () => {
    for (const item of compatibilityCases) {
      expect(item.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(item.className || item.evidence === 'build').toBeTruthy()
      expect(item.declarations.length || item.id === 'directive-import').toBeTruthy()
      expect(['css', 'geometry', 'interaction', 'pixel', 'directive']).toContain(item.probe)
    }
  })

  it('only accepts complete evidence after a report has been verified', () => {
    const baseline = baselineJson as CompatibilityBaseline
    const staticEvidence = staticEvidenceJson as StaticEvidenceReport
    const ids = compatibilityCases.map(item => item.id).sort()
    if (baseline.verifiedAt) {
      expect(baseline.results.map(item => item.id).sort()).toEqual(ids)
    }
    if (staticEvidence.catalogHash !== 'pending-static-e2e') {
      expect(staticEvidence.results.map(item => item.id).sort()).toEqual(ids)
      expect(staticEvidence.catalogHash).toBe(baseline.catalogHash === 'pending-native-e2e' ? staticEvidence.catalogHash : baseline.catalogHash)
    }
  })
})
