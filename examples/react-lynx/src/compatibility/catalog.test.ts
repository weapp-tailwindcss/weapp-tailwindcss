import type { CompatibilityBaseline, StaticEvidenceReport } from './types'
import { describe, expect, it } from 'vitest'
import { assertCurrentStaticEvidence } from '../../../../e2e/lynx/static-report'
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

  it('requires current complete static evidence independently of historical native results', () => {
    expect(() => assertCurrentStaticEvidence(staticEvidenceJson as StaticEvidenceReport)).not.toThrow()
  })

  it('preserves the stored identity and display format of historical native evidence', () => {
    const baseline = baselineJson as CompatibilityBaseline
    expect(baseline.schemaVersion).toBe(1)
    expect(Object.keys(baseline.versions).sort()).toEqual(['cssDefines', 'engineVersion', 'lynxEngine', 'tailwindcss'])
    for (const version of Object.values(baseline.versions)) {
      expect(version).toEqual(expect.any(String))
      expect(version.trim()).not.toBe('')
    }
    if (baseline.verifiedAt) {
      expect(new Date(baseline.verifiedAt).toISOString()).toBe(baseline.verifiedAt)
      expect(baseline.catalogHash).toMatch(/^[a-f0-9]{64}$/)
      expect(baseline.results.length).toBeGreaterThan(0)
    }
    else {
      expect(baseline.verifiedAt).toBeNull()
      expect(baseline.catalogHash).toBe('pending-native-e2e')
    }
    const ids = baseline.results.map(item => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const item of baseline.results) {
      expect(item.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(item.generated).toEqual(expect.any(Boolean))
      expect(item.bundled).toEqual(expect.any(Boolean))
      if (item.failureStage) {
        expect(['generation', 'encoder', 'runtime', 'version-limit']).toContain(item.failureStage)
      }
      for (const platform of ['ios', 'android'] as const) {
        expect(['supported', 'unsupported', 'not-tested']).toContain(item[platform].status)
        if (item[platform].status === 'unsupported') {
          expect(item[platform].reason?.trim()).toEqual(expect.any(String))
          expect(item[platform].reason?.trim()).not.toBe('')
        }
      }
    }
  })
})
