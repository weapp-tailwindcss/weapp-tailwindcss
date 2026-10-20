import type { CaseContract, EvidenceStage } from '../types'
import { compatibilityCases, officialFeatureManifest } from '@weapp-tailwindcss/test-catalog'
import { colorSchemeContract } from '../../../examples/react-lynx/src/compatibility/color-scheme-contract'
import { lynxEvidenceStrategy } from '../../../examples/react-lynx/src/compatibility/evidence'
import { overflowContract } from '../../../examples/react-lynx/src/compatibility/overflow-contract'
import { responsiveContract } from '../../../examples/react-lynx/src/compatibility/responsive-contract'
import { reviewedLynxContract } from '../../lynx/expectations'

export type LynxTarget = 'lynx-ios' | 'lynx-android'

// 这里只收录有完整固定预期的判定器；仅发生尺寸或像素变化的分支不构成语义验收。
export const geometryValidators = new Set([
  'layout-aspect',
  'layout-box-sizing',
  'sizing-size',
  'syntax-css-variable',
  'flex-grow',
  'flex-wrap-order',
  'flex-shorthand-shrink',
  'grid-placement',
  'grid-auto',
  'grid-justify-self',
  'variant-supports',
])
export const pixelValidators = new Map([
  ['background-linear-gradient', ['probe', 'control']],
  ['effect-shadow', ['probe', 'control']],
  ['transform-skew', ['probe', 'control']],
  [colorSchemeContract.id, [...colorSchemeContract.frames]],
  ['variant-structural', ['probe', 'control', 'reference']],
  ['type-flow', ['probe', 'control', 'reference']],
  ['syntax-important', ['probe', 'control', 'reference']],
])

export function lynxCaseContracts(target: LynxTarget, filter?: RegExp): CaseContract[] {
  const contracts = compatibilityCases.map<CaseContract>((item) => {
    const support = reviewedLynxContract.support[item.id]![target === 'lynx-ios' ? 0 : 1]
    const strategy = lynxEvidenceStrategy(item)
    const stage: EvidenceStage = item.evidence === 'build'
      ? 'generation'
      : reviewedLynxContract.encodingRejections.includes(item.id)
        ? 'encoding'
        : strategy === 'native-geometry' || strategy === 'interaction' || strategy === 'responsive' ? 'runtime' : 'visual'
    return {
      id: item.id,
      features: lynxAtomicFeatures(item.id),
      candidate: item.className,
      fixture: `Lynx ${strategy} 固定夹具`,
      expectation: {
        support,
        stage,
        ...(support === 'unsupported' ? { reason: `已审查的 ${target} 平台限制，预期停留在 ${stage} 阶段。${item.alternative ?? item.note ?? ''}` } : {}),
      },
      requiredAssertions: ['semantic-support'],
      expectedValues: { 'semantic-support': support },
    }
  })
  const covered = new Set(contracts.flatMap(item => item.features))
  for (const feature of new Map(officialFeatureManifest.map(item => [item.id, item])).values()) {
    if (!covered.has(feature.id)) {
      contracts.push({ id: `capability/${feature.id}`, features: [feature.id], candidate: '', fixture: 'missing-lynx-atomic-runtime-fixture', expectation: { support: 'supported', stage: 'runtime' }, requiredAssertions: ['runtime'], expectedValues: { runtime: true } })
    }
  }
  return contracts.filter(item => !filter || new RegExp(filter.source, filter.flags).test(item.id))
}

/** 混合案例保留原身份，只有单候选、单能力且有完整判定器时才贡献原子能力证据。 */
function lynxAtomicFeatures(id: string) {
  const item = compatibilityCases.find(item => item.id === id)!
  const features = officialFeatureManifest.filter(feature => feature.caseId === id).map(feature => feature.id)
  return (geometryValidators.has(id) || pixelValidators.has(id) || id === responsiveContract.id || id === overflowContract.id) && (item.className.match(/\S+/g) ?? []).length === 1 && features.length === 1 ? features : [`authoring/${id}`]
}

export const lynxAdapterFixture = {
  version: 2,
  reviewed: reviewedLynxContract,
  geometryValidators: [...geometryValidators],
  pixelValidators: [...pixelValidators],
  responsive: responsiveContract,
  overflow: overflowContract,
  cases: compatibilityCases,
}
