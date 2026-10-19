import type { NativeCaseResult, Platform, StaticCaseEvidence } from '../../examples/react-lynx/src/compatibility/types'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { importantPriorityContract } from '../../examples/react-lynx/src/compatibility/important-priority-contract'

// 此表是独立审查的双端契约（顺序为 iOS/Android），不从本轮静态失败推导 unsupported。
// 构建指令按生成语义登记支持；修改支持范围必须审查真实证据并显式修改此表。
export const reviewedLynxSupport: Record<string, readonly ['supported' | 'unsupported', 'supported' | 'unsupported']> = {
  'layout-aspect': ['supported', 'supported'],
  'layout-columns': ['unsupported', 'unsupported'],
  'layout-box-sizing': ['supported', 'supported'],
  'layout-display': ['supported', 'supported'],
  'layout-float': ['unsupported', 'unsupported'],
  'layout-isolation': ['unsupported', 'unsupported'],
  'layout-object-fit': ['unsupported', 'unsupported'],
  'layout-overflow': ['unsupported', 'unsupported'],
  'layout-position': ['supported', 'supported'],
  'layout-visibility': ['supported', 'supported'],
  'layout-z-index': ['supported', 'supported'],
  'flex-direction': ['supported', 'supported'],
  'flex-alignment': ['supported', 'supported'],
  'flex-grow': ['supported', 'supported'],
  'grid-template': ['supported', 'supported'],
  'spacing-margin': ['supported', 'supported'],
  'spacing-padding': ['supported', 'supported'],
  'spacing-logical': ['unsupported', 'unsupported'],
  'sizing-fixed': ['supported', 'supported'],
  'sizing-min-max': ['unsupported', 'supported'],
  'table-layout': ['unsupported', 'unsupported'],
  'type-size': ['supported', 'supported'],
  'type-weight-style': ['supported', 'supported'],
  'type-tracking': ['supported', 'supported'],
  'type-align-overflow': ['unsupported', 'unsupported'],
  'type-decoration': ['unsupported', 'unsupported'],
  'background-color': ['supported', 'supported'],
  'background-gradient': ['supported', 'supported'],
  'background-size': ['supported', 'supported'],
  'border-width-color': ['supported', 'supported'],
  'border-radius': ['supported', 'supported'],
  'effect-opacity': ['supported', 'supported'],
  'effect-shadow': ['supported', 'supported'],
  'effect-blend': ['unsupported', 'unsupported'],
  'filter-blur': ['supported', 'supported'],
  'filter-backdrop': ['unsupported', 'unsupported'],
  'svg-fill-stroke': ['unsupported', 'unsupported'],
  'accessibility-sr': ['supported', 'supported'],
  'transform-translate': ['unsupported', 'unsupported'],
  'transform-rotate': ['unsupported', 'unsupported'],
  'transform-scale': ['unsupported', 'unsupported'],
  'transform-origin': ['supported', 'supported'],
  'transition-basic': ['unsupported', 'unsupported'],
  'animation-spin': ['supported', 'supported'],
  'interaction-pointer': ['supported', 'supported'],
  'interaction-select': ['unsupported', 'unsupported'],
  'interaction-scroll': ['unsupported', 'unsupported'],
  'variant-responsive': ['unsupported', 'unsupported'],
  'variant-dark': ['unsupported', 'unsupported'],
  'variant-state': ['unsupported', 'unsupported'],
  'variant-structural': ['unsupported', 'unsupported'],
  'variant-group-peer': ['unsupported', 'unsupported'],
  'variant-data-aria': ['unsupported', 'unsupported'],
  'variant-supports': ['unsupported', 'unsupported'],
  'variant-pseudo-element': ['unsupported', 'unsupported'],
  'variant-arbitrary': ['supported', 'supported'],
  'syntax-negative': ['unsupported', 'unsupported'],
  'syntax-important': ['unsupported', 'unsupported'],
  'syntax-opacity-modifier': ['unsupported', 'unsupported'],
  'syntax-arbitrary-property': ['unsupported', 'unsupported'],
  'syntax-css-variable': ['supported', 'supported'],
  'syntax-type-hint': ['supported', 'supported'],
  'directive-import': ['supported', 'supported'],
  'directive-theme': ['supported', 'supported'],
  'directive-source': ['supported', 'supported'],
  'directive-utility': ['supported', 'supported'],
  'directive-variant': ['supported', 'supported'],
  'directive-apply': ['supported', 'supported'],
  'directive-reference': ['supported', 'supported'],
  'directive-config-plugin': ['supported', 'supported'],
  'directive-prefix-important': ['supported', 'supported'],
  'layout-break': ['unsupported', 'unsupported'],
  'layout-decoration-clear': ['unsupported', 'unsupported'],
  'layout-object-position': ['unsupported', 'unsupported'],
  'layout-overscroll': ['unsupported', 'unsupported'],
  'flex-wrap-order': ['supported', 'supported'],
  'flex-shorthand-shrink': ['supported', 'supported'],
  'grid-placement': ['supported', 'supported'],
  'grid-auto': ['unsupported', 'unsupported'],
  'grid-place': ['unsupported', 'unsupported'],
  'grid-justify-self': ['unsupported', 'unsupported'],
  'grid-align-content-self': ['supported', 'supported'],
  'spacing-space-between': ['unsupported', 'unsupported'],
  'sizing-size': ['supported', 'supported'],
  'type-family-smoothing-stretch': ['unsupported', 'unsupported'],
  'type-numeric': ['unsupported', 'unsupported'],
  'type-line-clamp': ['unsupported', 'unsupported'],
  'type-list': ['unsupported', 'unsupported'],
  'type-decoration-full': ['unsupported', 'unsupported'],
  'type-transform-wrap-indent': ['unsupported', 'unsupported'],
  'type-flow': ['unsupported', 'unsupported'],
  'type-breaking': ['unsupported', 'unsupported'],
  'type-content': ['unsupported', 'unsupported'],
  'background-attachment-clip-origin': ['unsupported', 'unsupported'],
  'background-linear-gradient': ['supported', 'supported'],
  'border-divide': ['unsupported', 'unsupported'],
  'border-outline': ['unsupported', 'unsupported'],
  'effect-ring': ['supported', 'supported'],
  'effect-inset-text-shadow': ['supported', 'supported'],
  'effect-background-blend': ['unsupported', 'unsupported'],
  'effect-mask-box': ['unsupported', 'unsupported'],
  'effect-mask-image-composite': ['unsupported', 'unsupported'],
  'filter-color-adjustments': ['unsupported', 'unsupported'],
  'filter-color-rotation': ['unsupported', 'unsupported'],
  'filter-drop-shadow': ['unsupported', 'unsupported'],
  'filter-backdrop-adjustments': ['unsupported', 'unsupported'],
  'table-spacing-caption': ['unsupported', 'unsupported'],
  'transform-skew': ['supported', 'supported'],
  'transform-perspective': ['unsupported', 'unsupported'],
  'transform-style-backface': ['unsupported', 'unsupported'],
  'transition-complete': ['unsupported', 'unsupported'],
  'interaction-form-colors': ['unsupported', 'unsupported'],
  'interaction-form-control': ['unsupported', 'unsupported'],
  'interaction-cursor-scheme': ['unsupported', 'unsupported'],
  'interaction-scroll-spacing': ['unsupported', 'unsupported'],
  'interaction-snap-touch': ['unsupported', 'unsupported'],
  'interaction-will-change': ['unsupported', 'unsupported'],
  'accessibility-forced-colors': ['unsupported', 'unsupported'],
}

// 已审查的 encoder 限制也必须停在同一阶段；generation 回归不能冒充平台限制。
const reviewedEncodingRejections = new Set([
  'layout-columns',
  'layout-float',
  'layout-isolation',
  'layout-object-fit',
  'spacing-logical',
  'table-layout',
  'type-decoration',
  'effect-blend',
  'filter-backdrop',
  'svg-fill-stroke',
  'transform-translate',
  'transform-rotate',
  'transform-scale',
  'interaction-select',
  'interaction-scroll',
  'variant-group-peer',
  'variant-data-aria',
  'variant-pseudo-element',
  'syntax-negative',
  'syntax-opacity-modifier',
  'syntax-arbitrary-property',
  'layout-break',
  'layout-decoration-clear',
  'layout-object-position',
  'layout-overscroll',
  'grid-place',
  'spacing-space-between',
  // 固定 0.0.49 的实际 NAPI/WASM 都拒绝 min-content、flex-end 和 pre-wrap；空诊断不能代替保留。
  // 支持状态仍沿用上表，只修正由输入 serializer 误判的失败阶段。
  'grid-auto',
  'grid-justify-self',
  'type-flow',
  'type-family-smoothing-stretch',
  'type-numeric',
  'type-line-clamp',
  'type-list',
  'type-decoration-full',
  'type-transform-wrap-indent',
  'type-breaking',
  'background-attachment-clip-origin',
  'border-divide',
  'border-outline',
  'effect-background-blend',
  'effect-mask-box',
  'effect-mask-image-composite',
  'filter-backdrop-adjustments',
  'table-spacing-caption',
  'transform-perspective',
  'transform-style-backface',
  'transition-complete',
  'interaction-form-colors',
  'interaction-form-control',
  'interaction-cursor-scheme',
  'interaction-scroll-spacing',
  'interaction-snap-touch',
  'interaction-will-change',
  'accessibility-forced-colors',
])

// :is/:where 的参数形式被固定 encoder 拒绝；逐候选保留该阶段，不能改用宿主 media 拒绝。
export const reviewedCandidateEncodingRejections = ['group-hover:block', 'peer-checked:opacity-100'] as const

export const reviewedLynxContract = { support: reviewedLynxSupport, encodingRejections: [...reviewedEncodingRejections], candidateEncodingRejections: reviewedCandidateEncodingRejections, importantPriority: importantPriorityContract }

const expectedIds = Object.keys(reviewedLynxSupport).sort()
if (JSON.stringify(expectedIds) !== JSON.stringify(compatibilityCases.map(item => item.id).sort())) {
  throw new Error('Lynx 支持契约与共享 catalog 不一致，新增案例必须显式审查支持预期')
}

export function assertReviewedLynxOutcome(result: NativeCaseResult, platform: Platform, built: StaticCaseEvidence) {
  if (!built.generated) {
    throw new Error(`Lynx ${platform}:${result.id} 的 generation 回归不能作为已验证的平台限制`)
  }
  const expected = reviewedLynxSupport[result.id]?.[platform === 'ios' ? 0 : 1]
  if (!expected || result.status !== expected) {
    throw new Error(`Lynx ${platform}:${result.id} 与已审查支持预期 ${expected ?? 'missing'} 不一致（实际 ${result.status}）；构建或运行失败不能自动降级成 unsupported`)
  }
  if (expected === 'unsupported' && reviewedEncodingRejections.has(result.id) === built.bundled) {
    throw new Error(`Lynx ${platform}:${result.id} 的失败阶段偏离已审查平台限制，不能把本轮其它失败归为 unsupported`)
  }
  if (result.id === 'variant-group-peer' && reviewedCandidateEncodingRejections.some((className) => {
    const candidate = built.candidates?.find(candidate => candidate.className === className)
    return !candidate?.generated || candidate.bundled || candidate.failureStage !== 'encoder' || candidate.mediaGuard
  })) {
    throw new Error('group/peer 的逐候选 encoder 拒绝合同发生变化，不能由媒体或输入失败替代')
  }
  if (result.id === 'variant-state') {
    const active = result.candidates?.find(candidate => candidate.className === 'active:bg-[#dc2626]')
    const hover = result.candidates?.find(candidate => candidate.className === 'hover:bg-[#ef4444]')
    if (active?.status !== 'supported' || hover?.status !== 'unsupported' || hover.mediaGate?.gate !== 'media') {
      throw new Error('variant-state 必须保留 active 支持与必要媒体条件拒绝，不能用其它运行失败替代已登记限制')
    }
  }
}
