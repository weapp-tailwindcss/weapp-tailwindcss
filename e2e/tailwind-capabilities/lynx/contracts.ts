import type { CaseContract, EvidenceStage } from '../types'
import { compatibilityCases, officialFeatureManifest } from '@weapp-tailwindcss/test-catalog'
import { lynxEvidenceStrategy } from '../../../examples/react-lynx/src/compatibility/evidence'
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
  ['variant-dark', ['light-probe', 'light-control', 'dark-probe', 'dark-control']],
  ['variant-structural', ['probe', 'control', 'reference']],
  ['type-flow', ['probe', 'control', 'reference']],
])

export function lynxCaseContracts(target: LynxTarget, filter?: RegExp): CaseContract[] {
  return compatibilityCases.filter(item => !filter || new RegExp(filter.source, filter.flags).test(item.id)).map((item) => {
    const support = reviewedLynxContract.support[item.id]![target === 'lynx-ios' ? 0 : 1]
    const strategy = lynxEvidenceStrategy(item)
    const stage: EvidenceStage = item.evidence === 'build'
      ? 'generation'
      : reviewedLynxContract.encodingRejections.includes(item.id)
        ? 'encoding'
        : strategy === 'native-geometry' || strategy === 'interaction' ? 'runtime' : 'visual'
    return {
      id: item.id,
      features: officialFeatureManifest.filter(feature => feature.caseId === item.id).map(feature => feature.id),
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
}

export const lynxAdapterFixture = {
  version: 1,
  reviewed: reviewedLynxContract,
  geometryValidators: [...geometryValidators],
  pixelValidators: [...pixelValidators],
  cases: compatibilityCases,
}
