import type { CompatibilityCase, StaticCaseEvidence } from './types'

/** 这些效果必须由宿主解码 PNG 后核对，截图指纹不同不能证明支持。 */
export function requiresPixelEffect(id: string) {
  return id === 'background-linear-gradient' || id === 'effect-shadow' || id === 'transform-skew' || id === 'variant-structural' || id === 'type-flow'
}

/** Lynx 的 Canvas 变换不一定进入 View 矩阵；保持共享 catalog，集中选择实际取证路径。 */
export function lynxEvidenceStrategy(item: CompatibilityCase) {
  if (item.evidence === 'build') {
    return 'build'
  }
  if (item.id === 'transform-skew') {
    return 'pixel-geometry'
  }
  if (item.id === 'variant-dark') {
    return 'color-scheme'
  }
  if (item.id === 'type-flow') {
    return 'pixel-effect'
  }
  if (item.probe === 'geometry' || item.id === 'variant-supports') {
    return 'native-geometry'
  }
  if (item.probe === 'interaction') {
    return 'interaction'
  }
  return requiresPixelEffect(item.id) ? 'pixel-effect' : 'pixel'
}

/** 采集端与验收端共用帧契约，不能用报告自报的列表决定完整性。 */
export function evidenceSequence(item: CompatibilityCase, built: Pick<StaticCaseEvidence, 'generated' | 'bundled'> | undefined) {
  const strategy = lynxEvidenceStrategy(item)
  if (!built?.generated || !built.bundled || strategy === 'build' || strategy === 'native-geometry') {
    return undefined
  }
  if (strategy === 'color-scheme') {
    return { checkpoint: 'pixel:color-scheme-v1', frames: ['light-probe', 'light-control', 'dark-probe', 'dark-control'] }
  }
  if (item.id === 'variant-structural') {
    return { checkpoint: 'pixel:structural-v1', frames: ['probe', 'control', 'reference'] }
  }
  if (item.id === 'type-flow') {
    return { checkpoint: 'pixel:text-flow-v1', frames: ['probe', 'control', 'reference'] }
  }
  if (strategy !== 'interaction') {
    return { checkpoint: 'pixel:probe-vs-control', frames: ['probe', 'control'] }
  }
  switch (item.id) {
    case 'variant-state': return { checkpoint: 'interaction:pseudo-active', frames: ['before', 'active'] }
    case 'animation-spin': return { checkpoint: 'interaction:animation-progress', frames: ['before', 'after'] }
    case 'transition-basic': return { checkpoint: 'interaction:transition-progress', frames: ['before', 'during', 'after'] }
    default: return undefined
  }
}
