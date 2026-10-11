import type { AtRule, ChildNode, Container, Declaration, Root, Rule } from 'postcss'
import type { Root as SelectorRoot } from 'postcss-selector-parser'
import type { Layer } from './model'
import type { Reporter } from './reporter'
import { selectorSpecificity } from '@csstools/selector-specificity'
import { createDescriptorRegistry } from './descriptors'
import { atomicAtRules } from './input'
import { createLayer } from './model'
import { atRuleName, parseLayerNames } from './names'

const groups = new Set(['media', 'supports', 'container', 'document', 'starting-style'])
const knownFunctions = new Set([':is', ':where', ':not', ':has', ':nth-child', ':nth-last-child'])

function wrap(node: ChildNode, wrappers: AtRule[]) {
  let output = node
  for (const wrapper of [...wrappers].reverse()) {
    const outer = wrapper.clone({ nodes: [] })
    outer.append(output)
    output = outer
  }
  return output
}

export function collectLayers(root: Root, selectors: WeakMap<Rule, SelectorRoot>, reporter: Reporter) {
  const rootLayer = createLayer('<unlayered>')
  const prologue: ChildNode[] = []
  const registerDescriptor = createDescriptorRegistry(reporter)
  let anonymous = 0

  const register = (node: AtRule, parent: Layer, conditional: boolean) => {
    const names = parseLayerNames(node, reporter)
    let introduced = false
    let target = parent
    if (names.length === 0) {
      target = createLayer(`${parent.label}.<anonymous:${++anonymous}>`)
      parent.children.set(Symbol(target.label), target)
      introduced = true
    }
    for (const path of names) {
      target = parent
      for (const segment of path) {
        let child = target.children.get(segment)
        if (!child) {
          child = createLayer(target === rootLayer ? JSON.stringify(segment) : `${target.label}.${JSON.stringify(segment)}`)
          target.children.set(segment, child)
          introduced = true
        }
        target = child
      }
    }
    if (introduced && conditional) {
      reporter.warn(node, 'LAYER_CONDITIONAL_ORDER', `层 ${target.label} 首次注册在条件中，顺序可能随环境变化。`, '在顶层预声明所有层的顺序。', { layer: target.label })
    }
    return target
  }

  const collectStyle = (rule: Rule, layer: Layer, wrappers: AtRule[]) => {
    const normal = rule.clone()
    normal.walkDecls((decl) => {
      if (decl.important) {
        decl.remove()
      }
    })
    const important = rule.clone({ nodes: [] })
    for (const node of rule.nodes) {
      if (node.type === 'decl' && node.important) {
        important.append(node.clone())
      }
    }
    if (normal.nodes.length > 0 || rule.nodes.length === 0) {
      layer.normal.push(wrap(normal, wrappers))
    }
    if (important.nodes.length > 0) {
      layer.important.push(wrap(important, wrappers))
    }
    const ast = selectors.get(rule)!
    ast.walkPseudos((pseudo) => {
      if (pseudo.toString().includes('(') && !knownFunctions.has(pseudo.value.toLowerCase())) {
        reporter.warn(rule, 'LAYER_SELECTOR_UNKNOWN', `无法可靠分析函数选择器 ${pseudo}。`, '确认该选择器的权重和目标支持，或使用 preserve。', { layer: layer.label, selector: rule.selector })
      }
    })
    layer.styles.push({
      rule,
      specificity: ast.nodes.map(selector => selectorSpecificity(selector)),
      declarations: rule.nodes.filter((node): node is Declaration => node.type === 'decl'),
    })
  }

  const visit = (container: Container, layer: Layer, wrappers: AtRule[]) => {
    for (const node of container.nodes ?? []) {
      if (node.type === 'atrule' && atRuleName(node) === 'layer') {
        const target = register(node, layer, wrappers.length > 0)
        if (node.nodes) {
          visit(node, target, wrappers)
        }
      }
      else if (node.type === 'atrule' && node.nodes && !atomicAtRules.test(atRuleName(node))
        && (groups.has(atRuleName(node)) || node.nodes.some(child => child.type === 'rule' || child.type === 'atrule'))) {
        if (!groups.has(atRuleName(node))) {
          reporter.warn(node, 'LAYER_WRAPPER_SEMANTICS', `保留 @${node.name} 包装，但不能证明展开 layer 后其语义等价。`, '验证包装规则的作用域语义，或使用 preserve。')
        }
        visit(node, layer, [...wrappers, node])
      }
      else if (node.type === 'rule') {
        collectStyle(node, layer, wrappers)
      }
      else if (node.type === 'decl') {
        reporter.fail(node, 'LAYER_NESTING', '声明必须属于样式规则或 descriptor。', '先展开 CSS nesting，修正输入结构。')
      }
      else {
        if (node.type === 'atrule' && /^(?:charset|import|namespace)$/.test(atRuleName(node))) {
          if (layer !== rootLayer || wrappers.length) {
            reporter.fail(node, 'LAYER_IMPORT', `@${node.name} 不能出现在 layer 或条件中。`, '将合法 prologue 放在顶层。')
          }
          prologue.push(node.clone())
          continue
        }
        if (node.type === 'atrule' && atomicAtRules.test(atRuleName(node))) {
          registerDescriptor(node, layer)
        }
        layer.normal.push(wrap(node.clone(), wrappers))
      }
    }
  }
  visit(root, rootLayer, [])
  return { rootLayer, prologue }
}
