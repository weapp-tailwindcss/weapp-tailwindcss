import type { StaticCaseEvidence } from './types'
import { describe, expect, it } from 'vitest'
import { compatibilityCases } from './catalog'
import { evidenceSequence } from './evidence'

describe('逐候选原生帧契约', () => {
  const item = compatibilityCases.find(item => item.id === 'variant-state')!
  const [active, hover] = item.className.split(/\s+/) as [string, string]
  const built: StaticCaseEvidence = {
    id: item.id,
    generated: true,
    bundled: false,
    generatedDeclarations: [],
    bundledDeclarations: [],
    cssDefinesKnown: [],
    candidates: [{ className: active, generated: true, bundled: true }, { className: hover, generated: true, bundled: false }],
  }

  it('hover 被 encoder 拒绝时仍必须采集保留的 active 帧', () => {
    expect(evidenceSequence(item, built)).toEqual({ checkpoint: 'interaction:pseudo-active', frames: ['before', 'active'] })
  })

  it('active 本身被拒绝时不能要求不存在的 active 帧', () => {
    expect(evidenceSequence(item, { ...built, candidates: built.candidates!.map(candidate => ({ ...candidate, bundled: false })) })).toBeUndefined()
  })
})
