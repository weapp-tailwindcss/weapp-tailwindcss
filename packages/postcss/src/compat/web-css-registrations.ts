import type { Node as ValueNode } from 'postcss-value-parser'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import { tailwindPropertyRegistrations } from '../cssVarsV4'
import { decodeCssIdentifier, getCssAtRulePrelude, getCssCustomPropertyName } from '../utils/css-custom-property'
import { normalizeModernColorValue } from './color-mix'

const signatures = new Map(tailwindPropertyRegistrations.map(item => [item.prop, item]))
type Signature = (typeof tailwindPropertyRegistrations)[number]

const lengthUnits = new Set('px cm mm q in pc pt em ex cap ch ic rem rex rcap rch ric lh rlh vw vh vi vb vmin vmax svw svh svi svb svmin svmax lvw lvh lvi lvb lvmin lvmax dvw dvh dvi dvb dvmin dvmax cqw cqh cqi cqb cqmin cqmax'.split(' '))

function isLiteralZeroLength(value: string) {
  const nodes = valueParser(value).nodes.filter(node => node.type !== 'space' && node.type !== 'comment')
  if (nodes.length !== 1 || nodes[0]?.type !== 'word') {
    return false
  }
  const match = /^[-+]?((?:\d*\.)?\d+)(?:e[-+]?\d+)?([a-z]*)$/i.exec(nodes[0].value)
  // 检查原始尾数，不能把下溢的非零数（如 1e-999rem）当成零。
  return !!match && /^[0.]+$/.test(match[1]!) && (!match[2] || lengthUnits.has(match[2].toLowerCase()))
}

function matchesInitialValue(value: string, signature: Signature) {
  return valueIdentity(value) === valueIdentity(signature.initialValue!)
    || (signature.syntax === '<length>' && isLiteralZeroLength(signature.initialValue!) && isLiteralZeroLength(value))
}

function valueIdentity(value: string): string {
  function nodesIdentity(nodes: ValueNode[]): unknown[] {
    return nodes.filter(node => node.type !== 'space' && node.type !== 'comment').map(node =>
      node.type === 'function' ? [node.type, node.value, nodesIdentity(node.nodes)] : [node.type, node.value],
    )
  }
  return JSON.stringify(nodesIdentity(valueParser(value).nodes))
}

function matchesSignature(rule: postcss.AtRule, signature: Signature) {
  const descriptors = new Map<string, string>()
  for (const node of rule.nodes ?? []) {
    if (node.type === 'comment') {
      continue
    }
    if (node.type !== 'decl' || node.important) {
      return false
    }
    const name = decodeCssIdentifier(node.prop)?.toLowerCase()
    if (!name || !['syntax', 'inherits', 'initial-value'].includes(name) || descriptors.has(name)) {
      return false
    }
    descriptors.set(name, node.value.trim())
  }
  const syntax = valueParser(descriptors.get('syntax') ?? '').nodes.filter(node => node.type !== 'space' && node.type !== 'comment')
  return syntax.length === 1 && syntax[0]?.type === 'string' && syntax[0].value === signature.syntax
    && decodeCssIdentifier(descriptors.get('inherits') ?? '')?.toLowerCase() === 'false'
    && (signature.initialValue === undefined
      ? !descriptors.has('initial-value')
      : descriptors.has('initial-value') && matchesInitialValue(descriptors.get('initial-value')!, signature))
}

/** 在结构改写前扫描所有同名注册；任何未知签名或条件位置均否决默认值合成。 */
export function collectRegisteredCustomPropertyFallbacks(root: postcss.Root) {
  const registered = new Map<string, Signature | undefined>()
  root.walkAtRules((rule) => {
    const prelude = getCssAtRulePrelude(rule)
    if (prelude.name.toLowerCase() !== 'property') {
      return
    }
    const name = getCssCustomPropertyName(prelude.params)
    if (!name) {
      return
    }
    const signature = signatures.get(name)
    const valid = signature && rule.parent === root && matchesSignature(rule, signature)
    if (!registered.has(name) || !valid) {
      registered.set(name, valid ? signature : undefined)
    }
  })
  return registered
}

function isDefaultsRule(rule: postcss.Rule) {
  const selectors = rule.selectors.map(selector => selector.replace(/^::?(before|after)$/, '::$1'))
  return (selectors.length === 3 || selectors.length === 4)
    && new Set(selectors).size === selectors.length
    && ['*', '::before', '::after'].every(selector => selectors.includes(selector))
    && selectors.every(selector => ['*', '::before', '::after', '::backdrop'].includes(selector))
}

function firstStyleNode(root: postcss.Root) {
  return root.nodes.find(node => node.type !== 'comment'
    && !(node.type === 'atrule' && (['charset', 'import', 'namespace'].includes(node.name.toLowerCase())
      || (node.name === 'layer' && !node.nodes))))
}

function hasDefaultDeclarations(candidate: postcss.Rule, defaults: postcss.Declaration[]) {
  const existing = new Map<string, string>()
  for (const node of candidate.nodes) {
    if (node.type === 'comment') {
      continue
    }
    if (node.type !== 'decl' || node.important || existing.has(node.prop)) {
      return false
    }
    existing.set(node.prop, node.value)
  }
  return defaults.every((decl) => {
    const actual = existing.get(decl.prop)
    const signature = signatures.get(decl.prop)
    return actual !== undefined && ((signature && matchesInitialValue(actual, signature))
      || valueIdentity(actual) === valueIdentity(normalizeModernColorValue(decl.value, new Map()).value))
  })
}

function hasCompleteFallback(root: postcss.Root, defaults: postcss.Declaration[], preserveLayers: boolean, prefixes: ReadonlySet<string>) {
  const first = firstStyleNode(root)
  const firstLayer = root.nodes.find(node => node.type === 'atrule' && node.name === 'layer')
  const lowestLayer = first?.type === 'atrule' && first.name === 'layer'
    && (firstLayer === first || (firstLayer?.type === 'atrule' && !firstLayer.nodes && firstLayer.params === first.params))
  const candidates = preserveLayers && lowestLayer ? first.nodes ?? [] : root.nodes.slice(first ? root.nodes.indexOf(first) : 0)
  const remaining = new Set(['universal', ...prefixes])
  for (const candidate of candidates) {
    if (candidate.type === 'comment') {
      continue
    }
    if (candidate.type !== 'rule' || !hasDefaultDeclarations(candidate, defaults)) {
      return false
    }
    const key = isDefaultsRule(candidate) ? 'universal' : candidate.selector.trim()
    if (!remaining.delete(key)) {
      return false
    }
    if (!remaining.size) {
      return true
    }
  }
  return false
}

export function insertRegisteredCustomPropertyFallbackRule(
  root: postcss.Root,
  registered: ReturnType<typeof collectRegisteredCustomPropertyFallbacks>,
  preserveLayers: boolean,
) {
  const declarations = [...registered.values()].flatMap(signature => signature?.initialValue === undefined
    ? []
    : [postcss.decl({ prop: signature.prop, value: signature.initialValue })])
  const prefixes = new Set<string>()
  root.walkRules((rule) => {
    for (const selector of rule.selectors) {
      if (['::-webkit-backdrop', '::-ms-backdrop'].includes(selector)) {
        prefixes.add(selector)
      }
    }
  })
  if (!declarations.length || hasCompleteFallback(root, declarations, preserveLayers, prefixes)) {
    return
  }
  const rule = postcss.rule({ selector: '*, ::before, ::after, ::backdrop', nodes: declarations })
  // 复用最终资产的前缀证据，分开规则以免未知伪元素令整组选择器失效。
  let fallbacks: postcss.ChildNode[] = [...prefixes].map(selector => rule.clone({ selector }))
  fallbacks.push(rule)
  if (preserveLayers) {
    // 前置 layer 声明可以早于 import；block 必须晚于 import，且默认层须最先登记。
    let name = '__weapp_tw_defaults'
    const layerNames: string[] = []
    root.walkAtRules('layer', (node) => {
      layerNames.push(node.params)
    })
    while (layerNames.some(params => params.includes(name))) {
      name += '_'
    }
    const order = postcss.atRule({ name: 'layer', params: name })
    const lastNamespace = root.nodes.findLastIndex(node => node.type === 'atrule' && node.name.toLowerCase() === 'namespace')
    const orderAnchor = lastNamespace >= 0
      ? root.nodes[lastNamespace + 1]
      : root.nodes.find(node => node.type !== 'comment' && !(node.type === 'atrule' && node.name.toLowerCase() === 'charset'))
    if (orderAnchor) {
      root.insertBefore(orderAnchor, order)
    }
    else {
      root.append(order)
    }
    fallbacks = [postcss.atRule({ name: 'layer', params: name, nodes: fallbacks })]
  }
  const anchor = firstStyleNode(root)
  if (anchor) {
    for (const fallback of fallbacks) {
      root.insertBefore(anchor, fallback)
    }
  }
  else {
    root.append(...fallbacks)
  }
}
