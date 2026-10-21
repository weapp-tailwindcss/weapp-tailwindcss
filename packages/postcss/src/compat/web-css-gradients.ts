import type postcss from 'postcss'
import type { collectRegisteredCustomPropertyFallbacks } from './web-css-registrations'
import { tokenize, TokenType } from '@csstools/css-tokenizer'
import { decodeCssIdentifier, getCssAtRulePrelude, getCssCustomPropertyName, isCssPropertyRegistration } from '../utils/css-custom-property'
import { normalizeTailwindcssV4GradientPosition } from './tailwindcss-v4'

type Gradient = 'linear' | 'radial' | 'conic'
interface Context { gradient?: Gradient, legacyGradient?: boolean, transparent: boolean, query?: boolean }
interface Reference extends Context { name: string }
interface Consumer { alias?: string, gradient?: Gradient, legacyGradient?: boolean, background?: boolean }

function gradientKind(name: string): Gradient | undefined {
  return /^(?:-(?:webkit|moz|o)-)?(?:repeating-)?linear-gradient$/.test(name)
    ? 'linear'
    : /^(?:-(?:webkit|moz|o)-)?(?:repeating-)?radial-gradient$/.test(name)
      ? 'radial'
      : /^(?:repeating-)?conic-gradient$/.test(name)
        ? 'conic'
        : undefined
}

/** 用真实函数 token 和显式栈保留每一次引用，避免转义空白、重复消费和深层函数丢失身份。 */
function references(value: string): Reference[] {
  if (!value.includes('(')) {
    return []
  }
  const result: Reference[] = []
  const tokens = tokenize({ css: value })
  const stack: Context[] = []
  let context: Context = { transparent: true }
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!
    if (token[0] === TokenType.Function) {
      const name = token[4].value.toLowerCase()
      if (name === 'var') {
        let end = index + 1
        while (tokens[end]?.[0] === TokenType.Whitespace || tokens[end]?.[0] === TokenType.Comment) {
          end++
        }
        const property = tokens[end++]
        while (tokens[end]?.[0] === TokenType.Whitespace || tokens[end]?.[0] === TokenType.Comment) {
          end++
        }
        if (property?.[0] === TokenType.Ident && property[4].value.startsWith('--')
          && (tokens[end]?.[0] === TokenType.Comma || tokens[end]?.[0] === TokenType.CloseParen)) {
          result.push({ name: property[4].value, ...context })
        }
      }
      stack.push(context)
      if (name !== 'var') {
        const gradient = gradientKind(name)
        context = { gradient, legacyGradient: !!gradient && name.startsWith('-'), transparent: !!gradient, query: context.query || name === 'style' }
      }
    }
    else if ([TokenType.OpenParen, TokenType.OpenSquare, TokenType.OpenCurly].includes(token[0])) {
      stack.push(context)
      context = { transparent: false, query: context.query }
    }
    else if ([TokenType.CloseParen, TokenType.CloseSquare, TokenType.CloseCurly].includes(token[0])) {
      context = stack.pop() ?? { transparent: false }
    }
    else if (context.query && token[0] === TokenType.Ident && token[4].value.startsWith('--')) {
      // style() 的属性查询直接读取名称，不一定出现 var()；if() 与容器查询共用此边界。
      result.push({ name: token[4].value, transparent: false })
    }
  }
  return result
}

/** 图按完整产物合并作用域；未知消费、非透明注册、循环和不完整 chunk 都不能证明变量用途。 */
function gradientConsumers(root: postcss.Root, registered: ReturnType<typeof collectRegisteredCustomPropertyFallbacks>) {
  const consumers = new Map<string, Consumer[]>()
  const add = (name: string, consumer: Consumer) => {
    const next = consumers.get(name) ?? []
    next.push(consumer)
    consumers.set(name, next)
  }
  let incomplete = false
  root.walkAtRules((rule) => {
    const prelude = getCssAtRulePrelude(rule)
    incomplete ||= prelude.name.toLowerCase() === 'import'
    for (const reference of references(prelude.params)) {
      add(reference.name, {})
    }
  })
  if (incomplete) {
    return undefined
  }
  root.walkDecls((decl) => {
    const alias = getCssCustomPropertyName(decl.prop)
    const property = (decodeCssIdentifier(decl.prop) ?? '').toLowerCase()
    const background = property === 'background' || property === 'background-image'
    const registration = isCssPropertyRegistration(decl)
    for (const { name, gradient, legacyGradient, transparent } of references(decl.value)) {
      add(name, registration || !transparent ? {} : alias ? { alias, gradient, legacyGradient } : background ? { background, gradient, legacyGradient } : {})
    }
  })
  const result = new Set<Gradient>()
  let legacyGradient = false
  const seen = new Set<string>()
  const active = new Set<string>()
  const stack: { name: string, gradient?: Gradient, exit?: boolean }[] = [{ name: '--tw-gradient-position' }]
  while (stack.length) {
    const item = stack.pop()!
    const key = JSON.stringify([item.name, item.gradient])
    if (item.exit) {
      active.delete(key)
      seen.add(key)
      continue
    }
    if (active.has(key) || (registered.has(item.name) && registered.get(item.name)?.syntax !== '*')) {
      return undefined
    }
    if (seen.has(key)) {
      continue
    }
    const next = consumers.get(item.name)
    if (!next?.length) {
      return undefined
    }
    active.add(key)
    stack.push({ ...item, exit: true })
    for (const consumer of next) {
      legacyGradient ||= !!consumer.legacyGradient
      if (item.gradient && consumer.gradient && item.gradient !== consumer.gradient) {
        return undefined
      }
      const gradient = consumer.gradient ?? item.gradient
      if (consumer.alias) {
        stack.push({ name: consumer.alias, gradient })
      }
      else if (consumer.background && gradient) {
        result.add(gradient)
      }
      else {
        return undefined
      }
    }
  }
  return result.size ? { kinds: result, legacyGradient } : undefined
}

export function normalizeWebGradientPositions(root: postcss.Root, registered: ReturnType<typeof collectRegisteredCustomPropertyFallbacks>) {
  const candidates: { decl: postcss.Declaration, normalized: string }[] = []
  root.walkDecls((decl) => {
    if (isCssPropertyRegistration(decl) || getCssCustomPropertyName(decl.prop) !== '--tw-gradient-position') {
      return
    }
    const normalized = normalizeTailwindcssV4GradientPosition(decl.value)
    if (normalized !== decl.value.trim()) {
      candidates.push({ decl, normalized })
    }
  })
  if (!candidates.length) {
    return
  }
  const consumers = gradientConsumers(root, registered)
  if (!consumers) {
    return
  }
  const { kinds, legacyGradient } = consumers
  const defaults: Record<Gradient, string> = { linear: 'to bottom', radial: 'at center', conic: 'from 0deg' }
  for (const { decl, normalized } of candidates) {
    if (normalized) {
      decl.value = normalized
    }
    else if (kinds.size === 1 && !legacyGradient) {
      decl.value = defaults[[...kinds][0]!]
    }
    // 多种梯度或前缀语法共用空位置时不能推断默认值；保留原始插值 token。
  }
}
