import postcss from 'postcss'
import { consumeCascadeLayers } from './cascade-layers'

const MINI_PROGRAM_UNSUPPORTED_AT_RULES = new Set([
  'property',
  'supports',
])

function removeAtRulesByScan(css: string, names: Set<string>) {
  let index = 0
  let result = ''
  const atRulePattern = new RegExp(`@(?:${[...names].join('|')})\\b`, 'i')

  while (index < css.length) {
    const match = atRulePattern.exec(css.slice(index))
    if (!match || match.index === undefined) {
      result += css.slice(index)
      break
    }

    const start = index + match.index
    result += css.slice(index, start)
    const blockStart = css.indexOf('{', start)
    if (blockStart === -1) {
      result += css.slice(start)
      break
    }

    let depth = 0
    let cursor = blockStart
    for (; cursor < css.length; cursor++) {
      const char = css[cursor]
      if (char === '{') {
        depth++
      }
      else if (char === '}') {
        depth--
        if (depth === 0) {
          cursor++
          break
        }
      }
    }

    index = cursor
  }

  return result
}

export function removeUnsupportedMiniProgramAtRulesRoot(root: postcss.Root) {
  root.walkAtRules((atRule) => {
    if (MINI_PROGRAM_UNSUPPORTED_AT_RULES.has(atRule.name)) {
      atRule.remove()
    }
  })
  root.walkAtRules((atRule) => {
    if (atRule.nodes && atRule.nodes.length === 0) {
      atRule.remove()
    }
  })
}

export function removeUnsupportedMiniProgramAtRules(css: string) {
  try {
    const root = postcss.parse(css)
    removeUnsupportedMiniProgramAtRulesRoot(root)
    return root.toString()
  }
  catch {
    return removeAtRulesByScan(css, MINI_PROGRAM_UNSUPPORTED_AT_RULES)
  }
}

export function removeUnsupportedAtSupports(css: string) {
  return removeUnsupportedMiniProgramAtRules(css)
}

/**
 * 移除小程序不支持的 cascade layer 语法，同时保留 layer 内的实际规则。
 */
export function removeUnsupportedCascadeLayers(root: postcss.Root) {
  consumeCascadeLayers(root)
}

export function unwrapUnsupportedCascadeLayers(css: string) {
  if (!css.includes('@layer')) {
    return css
  }
  try {
    const root = postcss.parse(css)
    removeUnsupportedCascadeLayers(root)
    return root.toString()
  }
  catch {
    return css
  }
}
