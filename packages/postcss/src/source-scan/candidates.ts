import { splitCandidateTokens } from '@weapp-tailwindcss/engine'
import { postcss } from '../postcss-runtime'
import { collectCssInlineSourceCandidates } from './inline-source'

function parseGeneratorCss(css: string) {
  let root: postcss.Root
  try {
    root = postcss.parse(css)
  }
  catch {
    return undefined
  }

  return root
}

function collectApplyCandidates(root: postcss.Root) {
  const candidates = new Set<string>()
  root.walkAtRules('apply', (rule) => {
    for (const candidate of splitCandidateTokens(rule.params)) {
      candidates.add(candidate)
    }
  })
  return candidates
}

export function collectCssApplyCandidates(css: string) {
  const root = parseGeneratorCss(css)
  return root ? [...collectApplyCandidates(root)].sort() : []
}

export function collectGeneratorCssCandidates(css: string) {
  const root = parseGeneratorCss(css)
  if (!root) {
    return []
  }

  const candidates = collectApplyCandidates(root)

  const inlineCandidates = collectCssInlineSourceCandidates(root)
  for (const candidate of inlineCandidates.included) {
    candidates.add(candidate)
  }
  for (const candidate of inlineCandidates.excluded) {
    candidates.delete(candidate)
  }

  return [...candidates].sort()
}

/** 仅收集具有 Tailwind 上下文的运行时 apply 候选，复用同一次解析结果。 */
export function collectRuntimeApplyCandidates(css: string) {
  if (!css.includes('@apply')) {
    return []
  }
  const root = parseGeneratorCss(css)
  if (!root) {
    return []
  }

  let hasContext = false
  const candidates = new Set<string>()
  root.walkAtRules((rule) => {
    if (
      rule.name === 'reference'
      || rule.name === 'import'
      || (rule.name === 'tailwind' && rule.params.trim() === 'utilities')
    ) {
      hasContext = true
    }
    if (rule.name === 'apply') {
      // 保留运行时候选的拆分与 important 处理，不替换为生成器的 token 语义。
      for (const candidate of rule.params.split(/\s+/)) {
        const normalized = candidate.replace(/!important$/, '').trim()
        if (normalized) {
          candidates.add(normalized)
        }
      }
    }
  })
  return hasContext ? [...candidates] : []
}
