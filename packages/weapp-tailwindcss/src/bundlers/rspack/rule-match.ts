import { isSourceStyleRequest } from '@/generation/style-requests'

export interface RspackRuleLike {
  exclude?: unknown
  include?: unknown
  oneOf?: unknown[]
  resource?: unknown
  resourceQuery?: unknown
  rules?: unknown[]
  test?: unknown
  type?: unknown
  use?: unknown
  [key: string]: unknown
}

const STYLE_RULE_PROBES = [
  'weapp-tailwindcss.css',
  'weapp-tailwindcss.module.css',
  'weapp-tailwindcss.wxss',
  'weapp-tailwindcss.acss',
  'weapp-tailwindcss.ttss',
  'weapp-tailwindcss.qss',
  'weapp-tailwindcss.jxss',
  'weapp-tailwindcss.scss',
  'weapp-tailwindcss.module.scss',
  'weapp-tailwindcss.less',
  'weapp-tailwindcss.styl',
  'weapp-tailwindcss.pcss',
]
const SCRIPT_RULE_PROBES = [
  'weapp-tailwindcss.js',
  'weapp-tailwindcss.jsx',
  'weapp-tailwindcss.mjs',
  'weapp-tailwindcss.cjs',
  'weapp-tailwindcss.ts',
  'weapp-tailwindcss.tsx',
]
const STYLE_RESOURCE_QUERY_PROBES = [
  'type=style',
  'type=styles',
  'vue&type=style&index=0&lang.css',
]

function isRegExpLike(value: unknown): value is RegExp {
  return value instanceof RegExp
}

function testRegexpMatcher(matcher: RegExp, input: string) {
  const lastIndex = matcher.lastIndex
  matcher.lastIndex = 0
  const result = matcher.test(input)
  matcher.lastIndex = lastIndex
  return result
}

function matchesStringCondition(condition: unknown, input: string): boolean | undefined {
  if (typeof condition === 'string') {
    return input.includes(condition)
  }
  if (isRegExpLike(condition)) {
    return testRegexpMatcher(condition, input)
  }
  return undefined
}

function matchesCondition(condition: unknown, input: string): boolean | undefined {
  if (Array.isArray(condition)) {
    let hasStaticMatcher = false
    for (const item of condition) {
      const matched = matchesCondition(item, input)
      if (matched === true) {
        return true
      }
      hasStaticMatcher ||= matched === false
    }
    return hasStaticMatcher ? false : undefined
  }

  if (typeof condition === 'object' && condition !== null && !isRegExpLike(condition)) {
    const group = condition as {
      and?: unknown[]
      not?: unknown
      or?: unknown[]
    }

    if (Array.isArray(group.and)) {
      let hasUnknown = false
      for (const item of group.and) {
        const matched = matchesCondition(item, input)
        if (matched === false) {
          return false
        }
        hasUnknown ||= matched === undefined
      }
      return hasUnknown ? undefined : true
    }

    if (Array.isArray(group.or)) {
      return matchesCondition(group.or, input)
    }

    if (group.not !== undefined) {
      const matched = matchesCondition(group.not, input)
      return matched === undefined ? undefined : !matched
    }

    return undefined
  }

  return matchesStringCondition(condition, input)
}

function matchesAnyStringCondition(condition: unknown, inputs: string[]): boolean | undefined {
  let hasStaticMatcher = false
  for (const input of inputs) {
    const matched = matchesCondition(condition, input)
    if (matched === true) {
      return true
    }
    hasStaticMatcher ||= matched === false
  }
  return hasStaticMatcher ? false : undefined
}

function matchesStyleResourceCondition(condition: unknown): boolean | undefined {
  if (typeof condition === 'function') {
    return undefined
  }
  if (typeof condition === 'string' && isSourceStyleRequest(condition)) {
    return true
  }
  const matched = matchesAnyStringCondition(condition, STYLE_RULE_PROBES)
  return typeof condition === 'string' && matched === false ? undefined : matched
}

function matchesResourceQueryCondition(condition: unknown): boolean | undefined {
  if (typeof condition === 'function') {
    return undefined
  }
  return matchesAnyStringCondition(condition, STYLE_RESOURCE_QUERY_PROBES)
}

export function resolveRuleCssMatch(rule: RspackRuleLike): boolean | undefined {
  const include = matchesAnyStringCondition(rule.include, STYLE_RULE_PROBES)
  if (include === true) {
    return true
  }

  const exclude = matchesAnyStringCondition(rule.exclude, STYLE_RULE_PROBES)
  if (exclude === true) {
    return false
  }

  const resource = matchesStyleResourceCondition(rule.resource)
  if (resource === true) {
    return true
  }

  const test = matchesAnyStringCondition(rule.test, STYLE_RULE_PROBES)
  if (test === true) {
    return true
  }

  if (matchesAnyStringCondition(rule.test, SCRIPT_RULE_PROBES) === true) {
    return false
  }

  const resourceQuery = matchesResourceQueryCondition(rule.resourceQuery)
  if (resourceQuery === true) {
    return true
  }

  if (typeof rule.type === 'string') {
    if (rule.type.includes('css') || rule.type.includes('style')) {
      return true
    }
    if (rule.type.includes('javascript')) {
      return false
    }
  }

  return undefined
}
