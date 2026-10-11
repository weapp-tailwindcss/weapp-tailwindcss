import type { Rule } from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { postcss } from '../postcss-runtime'
import { createAuthorSelectorMatcher } from './author-selector'
import { collectUsedTailwindcssV4Variables } from './tailwindcss-v4/variables'

/** 判断 Tailwind 的元素级变量初始化，兼容 Vue 已注入的 scoped 属性。 */
export function isTailwindRuntimePropertyRule(rule: Rule) {
  if (!rule.nodes.some(node => node.type === 'decl')
    || !rule.nodes.every(node => node.type === 'comment' || (node.type === 'decl' && node.prop.startsWith('--tw-')))) {
    return false
  }
  let valid = true
  selectorParser((selectors) => {
    selectors.walk((node) => {
      if (node.type === 'selector' || node.type === 'universal'
        || (node.type === 'attribute' && node.attribute.startsWith('data-v-'))
        || (node.type === 'pseudo' && ['::before', '::after', '::backdrop', ':before', ':after'].includes(node.value))) {
        return
      }
      valid = false
    })
  }).processSync(rule.selector)
  return valid
}

function normalizeSelector(selector: string) {
  return selector.replace(/\s+/g, ' ').trim()
}

function atRuleKey(name: string, params: string) {
  return `${name.toLowerCase()}\0${params.replace(/\s+/g, ' ').trim()}`
}

/**
 * `@apply` 只应把声明带回作者样式，不能把 Tailwind 根入口的 preflight、
 * utilities 复制进 scoped style 模块；Web 保留实际使用的运行时变量初始化和注册。
 */
export function retainUniAppXAuthorApplyCss(
  generatedCss: string,
  authorCss: string,
  options: { preserveRuntimeProperties?: boolean } = {},
) {
  try {
    const authorRoot = postcss.parse(authorCss)
    const authorSelectors = new Set<string>()
    const authorAtRules = new Set<string>()
    authorRoot.walkRules((rule) => {
      for (const selector of rule.selectors ?? [rule.selector]) {
        authorSelectors.add(normalizeSelector(selector))
      }
    })
    authorRoot.walkAtRules((atRule) => {
      if (!['apply', 'reference', 'import', 'tailwind', 'theme', 'source', 'config', 'plugin'].includes(atRule.name)) {
        authorAtRules.add(atRuleKey(atRule.name, atRule.params))
      }
    })

    const matchesAuthorSelector = createAuthorSelectorMatcher(authorSelectors)
    const root = postcss.parse(generatedCss)
    const usedProperties = new Set<string>()
    if (options.preserveRuntimeProperties) {
      const retained = postcss.root()
      root.walkRules((rule) => {
        const selectors = rule.selectors.filter(selector => matchesAuthorSelector(normalizeSelector(selector)))
        if (selectors.length > 0) {
          retained.append(rule.clone({ selectors }))
        }
      })
      for (const prop of collectUsedTailwindcssV4Variables(retained)) {
        usedProperties.add(prop)
      }
    }
    let changed = false
    root.walkRules((rule) => {
      const selectors = rule.selectors ?? [rule.selector]
      const retainedSelectors = selectors.filter(selector => matchesAuthorSelector(normalizeSelector(selector)))
      if (retainedSelectors.length > 0) {
        if (retainedSelectors.length !== selectors.length) {
          rule.selectors = retainedSelectors
          changed = true
        }
        return
      }
      // Web 局部样式仍需要元素级运行时默认值，不能把它们当作 preflight 丢弃。
      if (
        options.preserveRuntimeProperties
        && isTailwindRuntimePropertyRule(rule)
      ) {
        rule.walkDecls((decl) => {
          if (!usedProperties.has(decl.prop)) {
            decl.remove()
            changed = true
          }
        })
        if (rule.nodes.some(node => node.type === 'decl')) {
          return
        }
      }
      rule.remove()
      changed = true
    })
    root.walkAtRules((atRule) => {
      if (options.preserveRuntimeProperties && atRule.name === 'property' && usedProperties.has(atRule.params.trim())) {
        return
      }
      if (authorAtRules.has(atRuleKey(atRule.name, atRule.params))) {
        return
      }
      if (atRule.nodes?.some(node => node.type === 'rule' || node.type === 'atrule')) {
        return
      }
      atRule.remove()
      changed = true
    })
    root.walkComments((comment) => {
      if (/tailwindcss v\d|weapp-tailwindcss (?:vite-generated-css|layer|uni-app-x web preflight reset)/i.test(comment.text)) {
        comment.remove()
        changed = true
      }
    })
    return changed ? root.toString().trim() : generatedCss
  }
  catch {
    return generatedCss
  }
}
