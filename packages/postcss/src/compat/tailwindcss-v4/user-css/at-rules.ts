import { postcss } from '../../../postcss-runtime'
import { removeBalancedAtRuleBlock } from './generated-cleanup'

export function removeTailwindSourceMediaBlocks(source: string) {
  let next = source
  let changed = false
  const sourceMediaRE = /@media\s+source\([^)]*\)\s*\{/g
  for (;;) {
    sourceMediaRE.lastIndex = 0
    const match = sourceMediaRE.exec(next)
    if (!match) {
      break
    }
    const blockStart = next.indexOf('{', match.index)
    if (blockStart === -1) {
      break
    }
    let depth = 0
    let blockEnd = -1
    for (let index = blockStart; index < next.length; index++) {
      const char = next[index]
      if (char === '{') {
        depth++
        continue
      }
      if (char !== '}') {
        continue
      }
      depth--
      if (depth === 0) {
        blockEnd = index
        break
      }
    }
    if (blockEnd === -1) {
      break
    }
    next = `${next.slice(0, match.index)}${next.slice(blockEnd + 1)}`
    changed = true
  }
  for (;;) {
    const atRuleStart = findTailwindSourceWrapperBlockStart(next)
    if (atRuleStart === -1) {
      break
    }
    next = removeBalancedAtRuleBlock(next, atRuleStart)
    changed = true
  }
  return changed ? next : source
}

export function terminateTailwindSourceAtRulesBeforeNextDirective(source: string) {
  if (!source.includes('@source')) {
    return source
  }
  let next = ''
  let searchIndex = 0
  for (;;) {
    const atRuleStart = source.indexOf('@source', searchIndex)
    if (atRuleStart === -1) {
      next += source.slice(searchIndex)
      break
    }
    const nextChar = source[atRuleStart + '@source'.length]
    if (nextChar && /[\w-]/.test(nextChar)) {
      next += source.slice(searchIndex, atRuleStart + '@source'.length)
      searchIndex = atRuleStart + '@source'.length
      continue
    }
    next += source.slice(searchIndex, atRuleStart)
    let quote: string | undefined
    let parenDepth = 0
    let terminated = false
    let index = atRuleStart + '@source'.length
    for (; index < source.length; index++) {
      const char = source[index]
      if (quote) {
        if (char === '\\') {
          index++
          continue
        }
        if (char === quote) {
          quote = undefined
        }
        continue
      }
      if (char === '"' || char === '\'') {
        quote = char
        continue
      }
      if (char === '(') {
        parenDepth++
        continue
      }
      if (char === ')' && parenDepth > 0) {
        parenDepth--
        continue
      }
      if (parenDepth > 0) {
        continue
      }
      if (char === ';' || char === '{') {
        terminated = true
        index++
        break
      }
      if (
        char === '@'
        && /^(?:config|custom-variant|plugin|source|theme|utility|variant)\b/.test(source.slice(index + 1))
      ) {
        break
      }
    }
    const segment = source.slice(atRuleStart, index)
    const trimmedSegment = segment.trimEnd()
    next += terminated || trimmedSegment.endsWith(';') || trimmedSegment.endsWith('{')
      ? segment
      : `${trimmedSegment};${segment.slice(trimmedSegment.length)}`
    searchIndex = index
  }
  return next
}

function findTailwindSourceWrapperBlockStart(source: string) {
  let searchIndex = 0
  for (;;) {
    const atRuleStart = source.indexOf('@source', searchIndex)
    if (atRuleStart === -1) {
      return -1
    }
    const nextChar = source[atRuleStart + '@source'.length]
    if (nextChar && /[\w-]/.test(nextChar)) {
      searchIndex = atRuleStart + '@source'.length
      continue
    }
    let quote: string | undefined
    let parenDepth = 0
    for (let index = atRuleStart + '@source'.length; index < source.length; index++) {
      const char = source[index]
      if (quote) {
        if (char === '\\') {
          index++
          continue
        }
        if (char === quote) {
          quote = undefined
        }
        continue
      }
      if (char === '"' || char === '\'') {
        quote = char
        continue
      }
      if (char === '(') {
        parenDepth++
        continue
      }
      if (char === ')' && parenDepth > 0) {
        parenDepth--
        continue
      }
      if (parenDepth > 0) {
        continue
      }
      if (char === ';') {
        searchIndex = index + 1
        break
      }
      if (char === '{') {
        return atRuleStart
      }
    }
    if (searchIndex <= atRuleStart) {
      return -1
    }
  }
}

export function removeTailwindApplyAtRules(source: string) {
  if (!source.includes('@apply')) {
    return source
  }
  try {
    const root = postcss.parse(source)
    let changed = false
    root.walkAtRules('apply', (rule) => {
      rule.remove()
      changed = true
    })
    root.walk((node) => {
      if ('nodes' in node && node.nodes?.length === 0) {
        node.remove()
      }
    })
    return changed ? root.toString() : source
  }
  catch {
    return source
  }
}
