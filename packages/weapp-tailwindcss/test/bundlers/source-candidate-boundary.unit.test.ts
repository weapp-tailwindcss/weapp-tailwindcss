import { describe, expect, it } from 'vitest'
import * as sharedCandidates from '@/project-sources/candidates'
import * as sharedScan from '@/bundlers/shared/source-scan'
import * as sharedSignature from '@/bundlers/shared/source-candidate-scan-signature'
import * as viteCandidates from '@/bundlers/vite/source-candidates'
import * as viteScan from '@/bundlers/vite/source-scan'
import * as viteSignature from '@/bundlers/vite/source-candidate-scan-signature'

describe('source candidate bundler boundary', () => {
  it('keeps Vite entry points as compatibility facades over shared implementations', () => {
    expect(viteCandidates.createSourceCandidateCollector).toBe(sharedCandidates.createSourceCandidateCollector)
    expect(viteCandidates.createSourceCandidateStore).toBe(sharedCandidates.createSourceCandidateStore)
    expect(viteCandidates.isSourceCandidateRequest).toBe(sharedCandidates.isSourceCandidateRequest)
    expect(viteScan.resolveViteSourceScanEntries).toBe(sharedScan.resolveSourceScanEntries)
    expect(viteScan.createViteSourceScanMatcher).toBe(sharedScan.createSourceScanMatcher)
    expect(viteSignature.createSourceCandidateScanSignature).toBe(sharedSignature.createSourceCandidateScanSignature)
  })

  it('exposes candidate collection directly from the shared boundary', async () => {
    const collector = sharedCandidates.createSourceCandidateCollector({
      extractor: source => source.split(/\s+/).filter(Boolean),
    })

    await collector.sync('/project/pages/index.wxml', 'flex text-red-500')

    expect(collector.values()).toEqual(new Set(['flex', 'text-red-500']))
  })
})
