import type { Specificity } from '@csstools/selector-specificity'
import type { Layer, Style } from './model'
import type { Reporter } from './reporter'
import { compare } from '@csstools/selector-specificity'
import { affectedProperties } from './properties'

interface Witness {
  style: Style
  layer: Layer
  specificity: Specificity
}

function greater(a: Witness | undefined, b: Witness | undefined) {
  return !a ? b : !b || compare(a.specificity, b.specificity) >= 0 ? a : b
}

/** 每个属性保留一个代表，逐层提交索引，避免同层误报和成对扫描。 */
export function diagnoseConflicts(layers: Layer[], reporter: Reporter) {
  for (const important of [false, true]) {
    const index = new Map<string, Witness>()
    let allStandard: Witness | undefined
    for (const layer of important ? [...layers].reverse() : layers) {
      const pending = new Map<string, Witness>()
      for (const style of layer.styles) {
        const specificities = [...style.specificity].sort(compare)
        const minimum = specificities[0]!
        const maximum = specificities.at(-1)!
        const properties = new Set(style.declarations.filter(decl => Boolean(decl.important) === important).flatMap(decl => affectedProperties(decl.prop)))
        for (const property of properties) {
          const wildcardApplies = !property.startsWith('--') && property !== 'direction' && property !== 'unicode-bidi'
          const lower = property === '*' ? allStandard : greater(index.get(property), wildcardApplies ? index.get('*') : undefined)
          if (lower && compare(lower.specificity, minimum) > 0) {
            reporter.warn(style.rule, 'LAYER_SPECIFICITY', `${important ? 'important' : '普通'}声明的潜在权重冲突：层 ${lower.layer.label} 的 ${lower.style.rule.selector} 可能覆盖层 ${layer.label} 的 ${style.rule.selector}（${property}）。`, '统一跨层选择器权重、调整输入，或使用原生 layer；顺序展开不能模拟任意权重。', { related: lower.style.rule, layer: layer.label, selector: style.rule.selector, property })
          }
          pending.set(property, greater(pending.get(property), { style, layer, specificity: maximum })!)
        }
      }
      for (const [property, witness] of pending) {
        index.set(property, greater(index.get(property), witness)!)
        if (!property.startsWith('--') && property !== 'direction' && property !== 'unicode-bidi') {
          allStandard = greater(allStandard, witness)
        }
      }
    }
  }
}
