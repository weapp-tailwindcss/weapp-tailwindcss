import type { Declaration as PostcssDeclaration, Root, Rule } from 'postcss'
import { rule as createRule, Declaration } from 'postcss'
import valueParser from 'postcss-value-parser'
import { loadNativeCssBinding, nativeCssConfigured } from '../../native/binding'
import { CLAMP_PX, COLOR_VAR_RE, GRADIENT_BACKGROUND_RE, GRADIENT_DIRECTION_CLASS_RE, GRADIENT_STOPS_VAR_RE, INFINITY_CALC_VALUE_REGEXP, SIMPLE_CLASS_SELECTOR_RE, testIfRootHostForV4 } from './variables'

function collectTailwindcssV4ThemeVariables(root: Root) {
  const variables = new Map<string, string>()
  root.walkRules((rule) => {
    if (!testIfRootHostForV4(rule) && !rule.selector.includes('page') && !rule.selector.includes('.tw-root')) {
      return
    }
    rule.walkDecls((decl) => {
      if (decl.prop.startsWith('--color-')) {
        variables.set(decl.prop, decl.value)
      }
    })
  })
  return variables
}

function resolveTailwindcssV4GradientColor(value: string, themeVariables: ReadonlyMap<string, string>) {
  const trimmed = value.trim()
  const match = COLOR_VAR_RE.exec(trimmed)
  if (!match) {
    return trimmed
  }
  return themeVariables.get(match[1]!) ?? trimmed
}

function getSingleClassSelector(selector: string) {
  const match = SIMPLE_CLASS_SELECTOR_RE.exec(selector.trim())
  return match ? match[1] : undefined
}

function normalizeDeclarationValue(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeTailwindcssV4GradientPosition(value: string) {
  return (nativeCssConfigured ? loadNativeCssBinding()?.normalizeV4GradientPosition(value) : undefined)
    ?? normalizeTailwindcssV4GradientPositionLegacy(value)
}

export function normalizeTailwindcssV4GradientPositionLegacy(value: string) {
  return value
    .replace(/calc\(\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:deg|grad|rad|turn))\s*\*\s*-1\s*\)/gi, '-$1')
    .replace(/^in\s+(?:oklab|oklch|hsl|srgb)(?:\s+(?:longer|shorter|increasing|decreasing)\s+hue)?$/i, '')
    .replace(/\s+in\s+(?:oklab|oklch|hsl|srgb)(?:\s+(?:longer|shorter|increasing|decreasing)\s+hue)?\s*$/i, '')
    .replace(/\s+(?:longer|shorter|increasing|decreasing)\s*$/i, '')
    .trim()
}

export function normalizeTailwindcssV4InfinityCalcValue(value: string) {
  return (nativeCssConfigured ? loadNativeCssBinding()?.normalizeV4InfinityCalc(value, true) : undefined)
    ?? normalizeTailwindcssV4InfinityCalcValueLegacy(value)
}

export function normalizeTailwindcssV4InfinityCalcValueLegacy(value: string) {
  return INFINITY_CALC_VALUE_REGEXP.test(value.trim()) ? `${CLAMP_PX}px` : value
}

const INFINITY_CALC_CSS_RE = /calc\(\s*infinity\s*\*\s*(?:\d+(?:\.\d*)?|\.\d+)r?px\s*\)/gi

/** 在预处理器解析前收敛 Tailwind v4 生成的无限圆角，避免 Sass 将 infinity 当作非法表达式。 */
export function normalizeTailwindcssV4InfinityCalcCss(css: string) {
  return (nativeCssConfigured ? loadNativeCssBinding()?.normalizeV4InfinityCalc(css, false) : undefined)
    ?? normalizeTailwindcssV4InfinityCalcCssLegacy(css)
}

export function normalizeTailwindcssV4InfinityCalcCssLegacy(css: string) {
  return css.replace(INFINITY_CALC_CSS_RE, `${CLAMP_PX}px`)
}

export function normalizeTailwindcssV4GradientDirectionDeclaration(rule: Rule, decl: PostcssDeclaration) {
  const normalized = normalizeTailwindcssV4GradientPosition(decl.value)
  if (normalized) {
    return normalized
  }
  return getTailwindcssV4GradientFallback(rule) ?? normalized
}

/** 只读取当前父规则的首个 background-image，保持声明顺序与上下文归属。 */
export function getTailwindcssV4GradientFallback(rule: Rule) {
  const backgroundImageDecl = rule.nodes.find((node): node is PostcssDeclaration => {
    return node.type === 'decl' && node.prop === 'background-image'
  })
  if (!backgroundImageDecl) {
    return undefined
  }
  if (/^radial-gradient\(/i.test(backgroundImageDecl.value)) {
    return 'at center'
  }
  if (/^conic-gradient\(/i.test(backgroundImageDecl.value)) {
    return 'from 0deg'
  }
  return undefined
}

function appendStopPosition(color: string, position?: string) {
  const normalizedPosition = position?.trim()
  return normalizedPosition ? `${color} ${normalizedPosition}` : color
}

function getGradientStopsFallback(value: string) {
  if (!value.includes('var(') || !value.includes('--tw-gradient-stops')) {
    return undefined
  }
  const parsed = valueParser(value)
  let fallback: string | undefined
  parsed.walk((node) => {
    if (fallback || node.type !== 'function' || node.value.toLowerCase() !== 'var') {
      return
    }
    const firstCommaIndex = node.nodes.findIndex(child => child.type === 'div' && child.value === ',')
    const firstArg = node.nodes.find(child => child.type !== 'space')
    if (firstArg?.type !== 'word' || firstArg.value !== '--tw-gradient-stops' || firstCommaIndex < 0) {
      return
    }
    fallback = valueParser.stringify(node.nodes.slice(firstCommaIndex + 1)).trim()
  })
  return fallback
}

function isTailwindcssV4GradientDirectionRule(rule: Rule) {
  const classSelector = getSingleClassSelector(rule.selector)
  if (!classSelector || !GRADIENT_DIRECTION_CLASS_RE.test(classSelector)) {
    return false
  }
  return rule.nodes.some((node) => {
    return node.type === 'decl'
      && (
        node.prop === '--tw-gradient-position'
        || (node.prop === 'background-image' && node.value.includes('linear-gradient('))
      )
  })
}

function reorderTailwindcssV4GradientDirectionRule(rule: Rule) {
  const gradientPositionDecls: PostcssDeclaration[] = []
  const gradientBackgroundDecls: PostcssDeclaration[] = []
  for (const node of rule.nodes) {
    if (node.type !== 'decl') {
      continue
    }
    if (node.prop === '--tw-gradient-position') {
      gradientPositionDecls.push(node)
    }
    else if (node.prop === 'background-image' && node.value.includes('linear-gradient(')) {
      gradientBackgroundDecls.push(node)
    }
  }
  if (gradientPositionDecls.length === 0 || gradientBackgroundDecls.length === 0) {
    return
  }

  for (const decl of gradientPositionDecls) {
    decl.value = normalizeTailwindcssV4GradientDirectionDeclaration(rule, decl)
  }

  const anchor = rule.nodes.find((node) => {
    return node.type === 'decl'
      && (
        node.prop === '--tw-gradient-position'
        || (node.prop === 'background-image' && node.value.includes('linear-gradient('))
      )
  })
  if (!anchor) {
    return
  }

  const ordered = [...gradientPositionDecls, ...gradientBackgroundDecls]
  const orderedClones = ordered.map(decl => decl.clone())
  anchor.replaceWith(...orderedClones)
  for (const decl of ordered) {
    if (decl.parent) {
      decl.remove()
    }
  }
}

// Tailwind v4 会把渐变方向和 background-image 拆到普通规则 / @supports 规则里，小程序端需要收敛为一条规则。
export function mergeTailwindcssV4GradientDirectionRules(root: Root) {
  const seen = new Map<string, Rule>()

  root.walkRules((rule) => {
    if (!isTailwindcssV4GradientDirectionRule(rule)) {
      return
    }
    rule.walkDecls('--tw-gradient-position', (decl) => {
      decl.value = normalizeTailwindcssV4GradientDirectionDeclaration(rule, decl)
    })
    const selector = rule.selector.trim()
    const previous = seen.get(selector)
    if (!previous || previous.parent !== rule.parent) {
      seen.set(selector, rule)
      return
    }

    for (const node of [...rule.nodes]) {
      if (node.type !== 'decl') {
        continue
      }
      if (node.prop !== '--tw-gradient-position' && node.prop !== 'background-image') {
        continue
      }
      previous.append(node.clone())
    }
    reorderTailwindcssV4GradientDirectionRule(previous)
    rule.remove()
  })
}

interface GradientBaseRule {
  classSelector: string
  order: number
  position: string
  type: 'conic' | 'linear' | 'radial'
}

interface GradientColorRule {
  classSelector: string
  color: string
  order: number
  position?: string
}

function createTailwindcssV4MiniProgramGradientValue(
  gradient: GradientBaseRule,
  from: GradientColorRule,
  to: GradientColorRule,
  via?: GradientColorRule,
) {
  const stops = [
    gradient.position,
    appendStopPosition(from.color, from.position),
  ]
  if (via) {
    stops.push(appendStopPosition(via.color, via.position))
  }
  stops.push(appendStopPosition(to.color, to.position))
  return `${gradient.type}-gradient(${stops.filter(Boolean).join(', ')})`
}

// 微信开发者工具对 gradient 内嵌多层 CSS 变量支持不完整，这里为实际生成的 v4 渐变组合补字面量兜底。
export function appendTailwindcssV4MiniProgramGradientRules(root: Root) {
  const themeVariables = collectTailwindcssV4ThemeVariables(root)
  const gradients: GradientBaseRule[] = []
  const fromColors = new Map<string, GradientColorRule>()
  const viaColors = new Map<string, GradientColorRule>()
  const toColors = new Map<string, GradientColorRule>()
  const fromPositions: Array<{ classSelector: string, position: string }> = []
  const viaPositions: Array<{ classSelector: string, position: string }> = []
  const toPositions: Array<{ classSelector: string, position: string }> = []
  const directBackgroundImages: Array<{ selector: string, value: string }> = []
  const existingBackgroundImages = new Map<string, Set<string>>()
  const ruleOrder = new Map<string, number>()
  let order = 0

  root.walkRules((rule) => {
    const classSelector = getSingleClassSelector(rule.selector)
    const currentOrder = order++
    if (classSelector) {
      ruleOrder.set(classSelector, currentOrder)
    }
    rule.walkDecls('background-image', (decl) => {
      const selector = rule.selector.trim()
      const values = existingBackgroundImages.get(selector)
      if (values) {
        values.add(normalizeDeclarationValue(decl.value))
      }
      else {
        existingBackgroundImages.set(selector, new Set([normalizeDeclarationValue(decl.value)]))
      }
    })
    if (classSelector) {
      const gradientPositionDecl = rule.nodes.find((node): node is PostcssDeclaration => {
        return node.type === 'decl' && node.prop === '--tw-gradient-position'
      })
      const gradientBackgroundDecl = rule.nodes.find((node): node is PostcssDeclaration => {
        return node.type === 'decl' && node.prop === 'background-image' && GRADIENT_BACKGROUND_RE.test(node.value)
      })
      if (gradientPositionDecl && gradientBackgroundDecl) {
        const gradientType = GRADIENT_BACKGROUND_RE.exec(gradientBackgroundDecl.value)?.[1] as GradientBaseRule['type'] | undefined
        if (gradientType) {
          gradients.push({
            classSelector,
            order: currentOrder,
            position: normalizeTailwindcssV4GradientDirectionDeclaration(rule, gradientPositionDecl),
            type: gradientType,
          })
          const fallback = GRADIENT_STOPS_VAR_RE.test(gradientBackgroundDecl.value)
            ? getGradientStopsFallback(gradientBackgroundDecl.value)
            : undefined
          if (fallback) {
            directBackgroundImages.push({
              selector: rule.selector.trim(),
              value: `${gradientType}-gradient(${fallback})`,
            })
          }
        }
      }
      rule.walkDecls((decl) => {
        if (decl.prop === '--tw-gradient-from') {
          fromColors.set(classSelector, {
            classSelector,
            color: resolveTailwindcssV4GradientColor(decl.value, themeVariables),
            order: currentOrder,
          })
        }
        else if (decl.prop === '--tw-gradient-from-position') {
          fromPositions.push({ classSelector, position: decl.value })
        }
        else if (decl.prop === '--tw-gradient-via') {
          viaColors.set(classSelector, {
            classSelector,
            color: resolveTailwindcssV4GradientColor(decl.value, themeVariables),
            order: currentOrder,
          })
        }
        else if (decl.prop === '--tw-gradient-via-position') {
          viaPositions.push({ classSelector, position: decl.value })
        }
        else if (decl.prop === '--tw-gradient-to') {
          toColors.set(classSelector, {
            classSelector,
            color: resolveTailwindcssV4GradientColor(decl.value, themeVariables),
            order: currentOrder,
          })
        }
        else if (decl.prop === '--tw-gradient-to-position') {
          toPositions.push({ classSelector, position: decl.value })
        }
      })
    }
  })

  const fromVariants: GradientColorRule[] = []
  const viaVariants: GradientColorRule[] = []
  const toVariants: GradientColorRule[] = []
  const positionedFromVariants: GradientColorRule[] = []
  const positionedViaVariants: GradientColorRule[] = []
  const positionedToVariants: GradientColorRule[] = []
  for (const color of fromColors.values()) {
    fromVariants.push(color)
    for (const position of fromPositions) {
      positionedFromVariants.push({
        ...color,
        classSelector: `${color.classSelector}.${position.classSelector}`,
        order: Math.max(color.order, ruleOrder.get(position.classSelector) ?? color.order),
        position: position.position,
      })
    }
  }
  for (const color of viaColors.values()) {
    viaVariants.push(color)
    for (const position of viaPositions) {
      positionedViaVariants.push({
        ...color,
        classSelector: `${color.classSelector}.${position.classSelector}`,
        order: Math.max(color.order, ruleOrder.get(position.classSelector) ?? color.order),
        position: position.position,
      })
    }
  }
  for (const color of toColors.values()) {
    toVariants.push(color)
    for (const position of toPositions) {
      positionedToVariants.push({
        ...color,
        classSelector: `${color.classSelector}.${position.classSelector}`,
        order: Math.max(color.order, ruleOrder.get(position.classSelector) ?? color.order),
        position: position.position,
      })
    }
  }

  function appendGradientRule(selector: string, value: string) {
    const normalizedValue = normalizeDeclarationValue(value)
    if (existingBackgroundImages.get(selector)?.has(normalizedValue)) {
      return
    }
    existingBackgroundImages.set(selector, new Set([
      ...(existingBackgroundImages.get(selector) ?? []),
      normalizedValue,
    ]))
    root.append(createRule({
      selector,
      nodes: [
        new Declaration({
          prop: 'background-image',
          value,
        }),
      ],
    }))
  }

  for (const { selector, value } of directBackgroundImages) {
    appendGradientRule(selector, value)
  }

  function appendGradientCombinations(
    gradient: GradientBaseRule,
    fromRules: GradientColorRule[],
    viaRules: GradientColorRule[],
    toRules: GradientColorRule[],
  ) {
    for (const from of fromRules) {
      for (const to of toRules) {
        appendGradientRule(
          `.${gradient.classSelector}.${from.classSelector}.${to.classSelector}`,
          createTailwindcssV4MiniProgramGradientValue(gradient, from, to),
        )
        for (const via of viaRules) {
          appendGradientRule(
            `.${gradient.classSelector}.${from.classSelector}.${via.classSelector}.${to.classSelector}`,
            createTailwindcssV4MiniProgramGradientValue(gradient, from, to, via),
          )
        }
      }
    }
  }

  for (const gradient of gradients) {
    if (gradient.position.includes(',') || /^var\(/i.test(gradient.position)) {
      continue
    }
    appendGradientCombinations(gradient, fromVariants, viaVariants, toVariants)
    appendGradientCombinations(gradient, positionedFromVariants, positionedViaVariants, positionedToVariants)
  }
}
