import type { CompatibilityCase, StaticCaseEvidence } from './types'
import { colorSchemeContract } from './color-scheme-contract'
import { importantPriorityContract } from './important-priority-contract'
import { geometryArtifactNames } from './native-geometry'

/** 这些效果必须由宿主解码 PNG 后核对，截图指纹不同不能证明支持。 */
export function requiresPixelEffect(id: string) {
  return id === 'background-linear-gradient' || id === 'effect-shadow' || id === 'transform-skew' || id === 'variant-structural' || id === 'type-flow' || id === importantPriorityContract.id
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
export function evidenceSequence(item: CompatibilityCase, built: Pick<StaticCaseEvidence, 'generated' | 'bundled' | 'candidates'> | undefined) {
  const strategy = lynxEvidenceStrategy(item)
  if (item.id === 'variant-state' && built?.candidates) {
    const active = built.candidates.find(candidate => candidate.className.startsWith('active:'))
    return active?.generated && active.bundled ? { checkpoint: 'interaction:pseudo-active', frames: ['before', 'active'] } : undefined
  }
  if (!built?.generated || !built.bundled || strategy === 'build' || strategy === 'native-geometry') {
    return undefined
  }
  if (strategy === 'color-scheme') {
    return { checkpoint: colorSchemeContract.checkpoint, frames: [...colorSchemeContract.frames] }
  }
  if (item.id === 'variant-structural') {
    return { checkpoint: 'pixel:structural-v1', frames: ['probe', 'control', 'reference'] }
  }
  if (item.id === 'type-flow') {
    return { checkpoint: 'pixel:text-flow-v1', frames: ['probe', 'control', 'reference'] }
  }
  if (item.id === importantPriorityContract.id) {
    return { checkpoint: importantPriorityContract.checkpoint, frames: [...importantPriorityContract.frames] }
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

/** 原生几何侧车和 PNG 与普通像素序列共用精确清单，拒绝遗漏或额外文件。 */
export function evidenceArtifactNames(item: CompatibilityCase, built: Pick<StaticCaseEvidence, 'generated' | 'bundled' | 'candidates'> | undefined) {
  if (built?.generated && built.bundled && lynxEvidenceStrategy(item) === 'native-geometry') {
    return geometryArtifactNames(item.id)
  }
  return evidenceSequence(item, built)?.frames.map(frame => `${item.id}-${frame}.png`) ?? []
}
