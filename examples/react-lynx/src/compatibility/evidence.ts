import type { CompatibilityCase, StaticCaseEvidence } from './types'

/** 这些效果必须由宿主解码 PNG 后核对，截图指纹不同不能证明支持。 */
export function requiresPixelEffect(id: string) {
  return id === 'background-linear-gradient' || id === 'effect-shadow'
}

/** 采集端与验收端共用帧契约，不能用报告自报的列表决定完整性。 */
export function evidenceSequence(item: CompatibilityCase, built: Pick<StaticCaseEvidence, 'generated' | 'bundled'> | undefined) {
  if (!built?.generated || !built.bundled || item.evidence === 'build' || item.probe === 'geometry') {
    return undefined
  }
  if (item.probe !== 'interaction') {
    return { checkpoint: 'pixel:probe-vs-control', frames: ['probe', 'control'] }
  }
  switch (item.id) {
    case 'variant-state': return { checkpoint: 'interaction:pseudo-active', frames: ['before', 'active'] }
    case 'animation-spin': return { checkpoint: 'interaction:animation-progress', frames: ['before', 'after'] }
    case 'transition-basic': return { checkpoint: 'interaction:transition-progress', frames: ['before', 'during', 'after'] }
    default: return undefined
  }
}
