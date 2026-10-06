/* eslint-disable style/max-statements-per-line */
import process from 'node:process'
import postcss from 'postcss'
import { ifdefAtRule, ifndefAtRule } from './constants'
import { hasWrappingVariantCondition } from './variant-condition'

type ConditionalValue = boolean | undefined

const PLATFORM_ENV_KEYS = [
  'WEAPP_TW_TARGET',
  'WEAPP_TAILWINDCSS_TARGET',
  'UNI_PLATFORM',
  'UNI_UTS_PLATFORM',
  'TARO_ENV',
  'MPX_CLI_MODE',
  'MPX_CURRENT_TARGET_MODE',
] as const

const CONDITIONAL_END_RE = /^\s*#endif\s*$/
const CUSTOM_VARIANT_CONDITIONAL_FALLBACK_RE = /@custom-variant\b[\s\S]*?\/\*\s*#ifn?def\s[^*]*\*\/[\s\S]*?@slot\b[\s\S]*?\/\*\s*#endif\s*\*\//

function normalizePlatformToken(value: string | undefined): string | undefined {
  const normalized = value?.trim().replaceAll('_', '-').toUpperCase()
  return normalized || undefined
}

function resolveCssMacroPlatform(options: { platform?: string } | undefined): string | undefined {
  const explicit = normalizePlatformToken(options?.platform)
  if (explicit) { return explicit }
  for (const key of PLATFORM_ENV_KEYS) {
    const value = normalizePlatformToken(process.env[key])
    if (value) { return value }
  }
  return undefined
}

function createPlatformTokenSet(platform: string | undefined) {
  const normalized = normalizePlatformToken(platform)
  const tokens = new Set<string>()
  if (!normalized) { return tokens }
  tokens.add(normalized)
  if (normalized.startsWith('MP-')) { tokens.add('MP') }
  if (normalized === 'WEAPP' || normalized === 'WEIXIN' || normalized === 'WX') {
    tokens.add('MP')
    tokens.add('MP-WEIXIN')
  }
  if (normalized === 'MP-WEIXIN') {
    tokens.add('WEAPP')
    tokens.add('WEIXIN')
    tokens.add('WX')
  }
  if (normalized === 'H5') { tokens.add('WEB') }
  if (normalized === 'WEB') { tokens.add('H5') }
  if (normalized === 'APP') { tokens.add('APP-PLUS') }
  if (normalized.startsWith('APP-')) { tokens.add('APP') }
  if (normalized.startsWith('QUICKAPP-WEBVIEW')) { tokens.add('QUICKAPP-WEBVIEW') }
  return tokens
}

function combineAnd(values: ConditionalValue[]): ConditionalValue {
  if (values.includes(false)) { return false }
  return values.every(value => value === true) ? true : undefined
}

function combineOr(values: ConditionalValue[]): ConditionalValue {
  if (values.includes(true)) { return true }
  return values.every(value => value === false) ? false : undefined
}

function evaluatePlatformExpression(expression: string, platformTokens: ReadonlySet<string>): ConditionalValue {
  const orValues = expression.split(/\s*\|\|\s*/).map((orPart) => {
    const andValues = orPart.split(/\s*&&\s*/).map((part) => {
      const token = normalizePlatformToken(part)
      if (!token || /[<>=!()]/.test(token)) { return undefined }
      return platformTokens.has(token)
    })
    return combineAnd(andValues)
  })
  return combineOr(orValues)
}

function negateConditionalValue(value: ConditionalValue): ConditionalValue {
  return value === undefined ? undefined : !value
}

function getActiveConditionalValue(stack: ConditionalValue[]): ConditionalValue {
  if (stack.includes(false)) { return false }
  return stack.includes(undefined) ? undefined : true
}

function parseConditionalStart(text: string) {
  const normalized = text.trim()
  if (!normalized.startsWith('#')) { return undefined }
  const body = normalized.slice(1).trimStart()
  for (const directive of ['ifndef', 'ifdef'] as const) {
    if (!body.startsWith(directive)) { continue }
    const expression = body.slice(directive.length).trim()
    if (expression.length === 0) { return undefined }
    return { directive, expression }
  }
  return undefined
}

function quoteAtRuleParam(value: string) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function hasSlotNode(nodes: postcss.ChildNode[]) {
  return nodes.some(node => node.type === 'atrule' && node.name === 'slot')
}

function createConditionalAtRule(start: NonNullable<ReturnType<typeof parseConditionalStart>>, nodes: postcss.ChildNode[]) {
  const rule = postcss.atRule({ name: start.directive === 'ifndef' ? ifndefAtRule : ifdefAtRule, params: quoteAtRuleParam(start.expression) })
  rule.append(...nodes.map(node => node.clone()))
  return rule
}

function findConditionalEnd(nodes: postcss.ChildNode[], index: number) {
  let depth = 1
  for (let searchIndex = index + 1; searchIndex < nodes.length; searchIndex += 1) {
    const current = nodes[searchIndex]
    if (current?.type !== 'comment') { continue }
    if (parseConditionalStart(current.text)) { depth += 1 }
    else if (CONDITIONAL_END_RE.test(current.text) && --depth === 0) { return searchIndex }
  }
  return -1
}

function rewriteCustomVariantConditionalComments(root: postcss.Root) {
  let changed = false
  const transformContainer = (container: postcss.Container, variant: postcss.AtRule): boolean => {
    const nodes = [...container.nodes ?? []]
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]
      const start = node?.type === 'comment' ? parseConditionalStart(node.text) : undefined
      if (!start) { continue }
      const endIndex = findConditionalEnd(nodes, index)
      if (endIndex < 0) { continue }
      const conditionalNodes = nodes.slice(index + 1, endIndex)
      if (!hasSlotNode(conditionalNodes)) { continue }
      if (container !== variant) {
        node.remove()
        nodes[endIndex]?.remove()
        const variantNodes = [...variant.nodes ?? []]
        variant.removeAll()
        variant.append(createConditionalAtRule(start, variantNodes))
        changed = true
        return true
      }
      node.replaceWith(createConditionalAtRule(start, conditionalNodes))
      for (const removedNode of nodes.slice(index + 1, endIndex + 1)) { removedNode.remove() }
      changed = true
    }
    for (const node of [...container.nodes ?? []]) {
      if ('nodes' in node && node.nodes && transformContainer(node, variant)) { return true }
    }
    return false
  }
  const variants: postcss.AtRule[] = []
  root.walkAtRules('custom-variant', rule => variants.push(rule))
  for (const variant of variants) { transformContainer(variant, variant) }
  return changed
}

function rewriteOuterCustomVariantConditionalComments(root: postcss.Root) {
  let changed = false
  const transformContainer = (container: postcss.Container) => {
    const nodes = [...container.nodes ?? []]
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]
      const start = node?.type === 'comment' ? parseConditionalStart(node.text) : undefined
      if (!start) { continue }
      const endIndex = findConditionalEnd(nodes, index)
      if (endIndex < 0) { continue }
      const conditionalNodes = nodes.slice(index + 1, endIndex)
      const customVariants = conditionalNodes.filter((current): current is postcss.AtRule => current.type === 'atrule' && current.name === 'custom-variant')
      if (customVariants.length === 0 || customVariants.some(variant => !variant.nodes?.length)) { continue }
      for (const variant of customVariants) {
        if (hasWrappingVariantCondition(variant, start.directive === 'ifndef' ? ifndefAtRule : ifdefAtRule, quoteAtRuleParam(start.expression))) { continue }
        const variantNodes = [...variant.nodes ?? []]
        variant.removeAll()
        variant.append(createConditionalAtRule(start, variantNodes))
        changed = true
      }
      const hasOnlyCustomVariants = conditionalNodes.every(current => current.type === 'comment' || (current.type === 'atrule' && current.name === 'custom-variant'))
      if (hasOnlyCustomVariants) {
        node.remove()
        for (const removedNode of nodes.slice(index + 1, endIndex + 1)) {
          if (removedNode.type === 'comment') { removedNode.remove() }
        }
        changed = true
      }
    }
    for (const node of [...container.nodes ?? []]) {
      if ('nodes' in node && node.nodes) { transformContainer(node) }
    }
  }
  transformContainer(root)
  return changed
}

export function compileCssMacroConditionalComments(css: string, options?: { platform?: string }) {
  const platformTokens = createPlatformTokenSet(resolveCssMacroPlatform(options))
  if (platformTokens.size === 0 || !css.includes('#if')) { return css }
  try {
    const root = postcss.parse(css)
    const transformContainer = (container: postcss.Container) => {
      const stack: ConditionalValue[] = []
      for (const node of [...container.nodes ?? []]) {
        if (node.type === 'comment') {
          const start = parseConditionalStart(node.text)
          if (start) {
            const value = start.directive === 'ifndef' ? negateConditionalValue(evaluatePlatformExpression(start.expression, platformTokens)) : evaluatePlatformExpression(start.expression, platformTokens)
            const parentActive = getActiveConditionalValue(stack)
            stack.push(value)
            if (parentActive !== undefined && value !== undefined) { node.remove() }
            continue
          }
          if (CONDITIONAL_END_RE.test(node.text)) {
            const value = stack.pop()
            const parentActive = getActiveConditionalValue(stack)
            if (parentActive !== undefined && value !== undefined) { node.remove() }
            continue
          }
        }
        if (getActiveConditionalValue(stack) === false) { node.remove() }
        else if ('nodes' in node && node.nodes) { transformContainer(node) }
      }
    }
    transformContainer(root)
    return root.toString()
  }
  catch { return css }
}

export function transformCssMacroTailwindV4Source(css: string): string {
  if (!hasCssMacroTailwindV4CustomVariantConditionalComments(css)) { return css }
  try {
    const root = postcss.parse(css)
    const outerChanged = rewriteOuterCustomVariantConditionalComments(root)
    const innerChanged = rewriteCustomVariantConditionalComments(root)
    return outerChanged || innerChanged ? root.toString() : css
  }
  catch { return css }
}

export function hasCssMacroTailwindV4CustomVariantConditionalComments(css: string | undefined): boolean {
  if (!css?.includes('@custom-variant') || !css.includes('#if') || !css.includes('@slot')) { return false }
  try {
    const root = postcss.parse(css)
    let found = false
    const hasConditionalSlot = (container: postcss.Container): boolean => {
      const nodes = [...container.nodes ?? []]
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index]
        if (node?.type !== 'comment' || !parseConditionalStart(node.text)) { continue }
        const tail = nodes.slice(index + 1)
        if (tail.some(current => current.type === 'comment' && CONDITIONAL_END_RE.test(current.text)) && hasSlotNode(tail)) { return true }
      }
      return nodes.some(node => 'nodes' in node && node.nodes && hasConditionalSlot(node))
    }
    root.walkAtRules('custom-variant', (rule) => {
      if (hasConditionalSlot(rule)) { found = true }
    })
    const scanOuterConditional = (container: postcss.Container) => {
      const nodes = [...container.nodes ?? []]
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index]
        if (node?.type !== 'comment' || !parseConditionalStart(node.text)) { continue }
        const endIndex = findConditionalEnd(nodes, index)
        if (endIndex < 0) { continue }
        if (nodes.slice(index + 1, endIndex).some(current => current.type === 'atrule' && current.name === 'custom-variant')) { return true }
      }
      return nodes.some(node => 'nodes' in node && node.nodes && scanOuterConditional(node))
    }
    found ||= scanOuterConditional(root)
    return found
  }
  catch { return CUSTOM_VARIANT_CONDITIONAL_FALLBACK_RE.test(css) }
}

export function hasCssMacroTailwindV4InternalAtRules(css: string | undefined): boolean {
  if (!css?.includes('@weapp-tw-if')) { return false }
  try {
    let found = false
    postcss.parse(css).walkAtRules((rule) => {
      if (rule.name === ifdefAtRule || rule.name === ifndefAtRule) { found = true }
    })
    return found
  }
  catch { return /@weapp-tw-ifn?def\b/.test(css) }
}
