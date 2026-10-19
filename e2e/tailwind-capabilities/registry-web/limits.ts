import type { BrowserEngine, CaseContract, SemanticAssertion } from '../types'
import type { RegistryObservation } from './measure'
import type { RegistryWebProfile } from './profiles'
import { parse } from 'postcss'
import { registryGeometryEqual, registryStyleEqual } from './measure'

export interface RegistryWebLimit {
  engine: BrowserEngine
  browserVersion: string
  property: string
  value: string
  reason: string
  specification: string
  mode: 'rejected-syntax' | 'unavailable-computed'
}

const versions = { chromium: '156.0.8078.4', firefox: '157.0', webkit: '27.2' }
const fragmentation = 'https://drafts.csswg.org/css-break-3/#break-between'
const alignment = 'https://drafts.csswg.org/css-align-3/#propdef-justify-content'
const masking = 'https://drafts.fxtf.org/css-masking-1/#the-mask-clip'

// 这些是按规范值域和固定引擎登记的负向合同；不接受由本轮参考无效果推导限制。
export function registryWebLimit(profile: RegistryWebProfile, engine: BrowserEngine, platform: string): RegistryWebLimit | undefined {
  const root = profile.featureId.slice(profile.featureId.lastIndexOf('/') + 1)
  const declaration = profile.declarations.find(item => !item.property.startsWith('--'))
  if (!declaration) {
    return
  }
  const create = (reason: string, specification: string, mode: RegistryWebLimit['mode'] = 'rejected-syntax'): RegistryWebLimit => ({ engine, browserVersion: versions[engine], property: declaration.property, value: declaration.value, reason, specification, mode })
  if (/^break-(?:before|after)-all$/.test(root)) {
    return create('CSS Fragmentation 定义 all，但固定的三个浏览器版本尚未实现该强制分页值。', fragmentation)
  }
  if (root === 'justify-baseline') {
    return create('CSS Box Alignment 的 justify-content 值域不包含 baseline；该官方 utility 的声明被浏览器拒绝。', alignment)
  }
  if (root === 'mix-blend-plus-darker' && engine !== 'webkit') {
    return create('固定 Chromium/Firefox 尚未实现 Compositing 的 plus-darker 混合运算；WebKit 保持正向合同。', 'https://drafts.fxtf.org/compositing-2/#porterduffcompositingoperators_plus_darker')
  }
  if (engine === 'firefox' && /^break-(?:before|after)-(?:column|avoid-page)$/.test(root)) {
    return create('固定 Firefox 尚未实现该 Fragmentation 分页/分栏值。', fragmentation)
  }
  if (engine === 'firefox' && root === 'text-pretty') {
    return create('固定 Firefox 尚未实现 CSS Text 的 pretty 换行值。', 'https://drafts.csswg.org/css-text-4/#valdef-text-wrap-style-pretty')
  }
  if (engine === 'firefox' && platform === 'linux' && /^(?:subpixel-)?antialiased$/.test(root)) {
    // Linux Firefox 不注册此 macOS 专属属性，CSS.supports 与 CSSOM 均拒绝其声明。
    return { ...create('Firefox 的 -moz-osx-font-smoothing 仅适用于 macOS；固定 Linux 版本拒绝其语法且不暴露 computed value。', 'https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-smooth'), property: '-moz-osx-font-smoothing', value: root === 'antialiased' ? 'grayscale' : 'auto' }
  }
  if (engine === 'webkit' && /^forced-color-adjust-(?:auto|none)$/.test(root)) {
    return create('固定 WebKit 尚未实现 forced-color-adjust 属性。', 'https://drafts.csswg.org/css-color-adjust-1/#forced-color-adjust-prop')
  }
  if (engine === 'webkit' && /^mask-(?:clip|origin)-(?:fill|stroke|view)$/.test(root)) {
    return create('固定 WebKit 尚未实现 mask clip/origin 的 SVG geometry-box 值。', masking)
  }
  if (engine === 'webkit' && root === 'place-content-baseline') {
    return create('固定 WebKit 尚未实现 place-content 的 baseline 值；其余对齐类保持正向合同。', 'https://drafts.csswg.org/css-align-3/#propdef-place-content')
  }
}

export function registryLimitContract(profile: RegistryWebProfile, limit: RegistryWebLimit): CaseContract {
  const expectedValues = { 'generated': true, 'negative-product-declaration-preserved': true, 'limit-version-reviewed': limit.browserVersion, 'syntax-supported': limit.mode !== 'rejected-syntax', 'cssom-value': limit.mode === 'rejected-syntax' ? '' : limit.value, 'negative-reference-unchanged': true, 'styles-match-reference': true, 'geometry-match-reference': true, ...(limit.mode === 'unavailable-computed' ? { 'computed-property-unavailable': '' } : {}) }
  return { id: profile.id, features: [profile.featureId], candidate: profile.candidate, fixture: JSON.stringify({ profile, limit }), expectation: { support: 'unsupported', stage: 'negative', reason: limit.reason }, requiredAssertions: Object.keys(expectedValues), expectedValues, assertionStages: Object.fromEntries(Object.keys(expectedValues).map(name => [name, name === 'generated' ? 'generation' : 'negative'])) }
}

export function registryEmittedNegativeDeclaration(css: string, profile: RegistryWebProfile, limit: RegistryWebLimit) {
  const expected = profile.declarations.filter(item => !['syntax', 'inherits', 'initial-value'].includes(item.property))
  const emitted = new Set<string>()
  // 负向清单只登记无转义的静态候选；不能用另一选择器的相同声明代证。
  parse(css).walkRules(`.${profile.candidate}`, (rule) => {
    rule.walkDecls((declaration) => {
      emitted.add(JSON.stringify([declaration.prop, declaration.value, declaration.important ?? false]))
    })
  })
  return expected.some(item => item.property === limit.property && item.value === limit.value)
    && expected.every(item => emitted.has(JSON.stringify([item.property, item.value, item.important])))
}

export function registryLimitAssertions(limit: RegistryWebLimit, generated: boolean, version: string, reference: RegistryObservation, baseline: RegistryObservation, actual: RegistryObservation, productEmitted: boolean): SemanticAssertion[] {
  const syntax = reference.declarationEvidence?.find(item => item.property === limit.property && item.value === limit.value)
  return [
    { name: 'generated', stage: 'generation', actual: generated, expected: true },
    { name: 'negative-product-declaration-preserved', stage: 'negative', actual: productEmitted, expected: true },
    { name: 'limit-version-reviewed', stage: 'negative', actual: version, expected: limit.browserVersion },
    { name: 'syntax-supported', stage: 'negative', actual: syntax?.supported ?? null, expected: limit.mode !== 'rejected-syntax' },
    { name: 'cssom-value', stage: 'negative', actual: syntax?.cssom ?? null, expected: limit.mode === 'rejected-syntax' ? '' : limit.value },
    { name: 'negative-reference-unchanged', stage: 'negative', actual: registryStyleEqual(reference, baseline) && registryGeometryEqual(reference, baseline), expected: true },
    { name: 'styles-match-reference', stage: 'negative', actual: registryStyleEqual(actual, reference), expected: true },
    { name: 'geometry-match-reference', stage: 'negative', actual: registryGeometryEqual(actual, reference), expected: true },
    ...(limit.mode === 'unavailable-computed' ? [{ name: 'computed-property-unavailable', stage: 'negative' as const, actual: reference.styles[limit.property] ?? null, expected: '' }] : []),
  ]
}
