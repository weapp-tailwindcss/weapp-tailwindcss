import postcss from 'postcss'
import { parseTailwindCssDirectiveRequest } from '../../generator-plugin/directives'
import { isMiniProgramLocalCssImportRequest } from '../../generator-plugin/local-imports'
import { hasEmptyCssBlockCandidate } from '../mini-program-css'
import { createCssAppend } from '../tailwindcss-v4/user-css/markers'
import { isStyleImportRequest } from './imports'

export function hasNonCommentCss(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').trim().length > 0
}

function collectCssImportAtRuleCss(css: string) {
  if (!css.includes('@import')) {
    return []
  }
  const fallbackImports = [...css.matchAll(/@import\s[^;]+;?/g)].map(match => match[0])
  if (fallbackImports.length > 0) {
    return fallbackImports
  }
  try {
    const root = postcss.parse(css)
    const imports: string[] = []
    root.each((node) => {
      if (node.type === 'atrule' && node.name === 'import') {
        imports.push(node.toString())
      }
    })
    return imports
  }
  catch {
    return []
  }
}

function parseCssImportRequest(importCss: string) {
  const trimmed = importCss.trim()
  if (!trimmed.startsWith('@import')) {
    return
  }
  const params = trimmed
    .slice('@import'.length)
    .trim()
    .replace(/;$/, '')
    .trim()
  return parseTailwindCssDirectiveRequest(params)
}

function shouldRestoreCssImportAtRule(importCss: string, miniProgram = false) {
  if (!miniProgram) {
    return true
  }
  const request = parseCssImportRequest(importCss)
  if (request === undefined) {
    return false
  }
  if (isMiniProgramLocalCssImportRequest(request)) {
    return true
  }
  return isStyleImportRequest(request) && !request.includes('/')
}

export function restoreProcessedCssImports(source: string, filtered: string, miniProgram = false) {
  const imports = collectCssImportAtRuleCss(source)
    .filter(importCss => shouldRestoreCssImportAtRule(importCss, miniProgram))
  if (imports.length === 0) {
    return filtered
  }
  const missingImports = imports.filter(importCss => !filtered.includes(importCss))
  if (missingImports.length === 0) {
    return filtered
  }
  return createCssAppend(missingImports.join('\n'), filtered)
}

export function removeCommentOnlyAtRules(css: string) {
  if (!hasEmptyCssBlockCandidate(css)) {
    return css
  }
  try {
    const root = postcss.parse(css)
    let changed = false
    root.walkAtRules((atRule) => {
      if (!atRule.nodes || atRule.nodes.length === 0) {
        return
      }
      const hasCss = atRule.nodes.some(node => node.type !== 'comment')
      if (hasCss) {
        return
      }
      atRule.remove()
      changed = true
    })
    return changed ? root.toString() : css
  }
  catch {
    return css
  }
}

export function isCssImportOnly(css: string) {
  let hasNonImportNode = false
  try {
    const root = postcss.parse(css)
    root.each((node) => {
      if (node.type === 'comment') {
        return
      }
      if (node.type !== 'atrule' || node.name !== 'import') {
        hasNonImportNode = true
      }
    })
  }
  catch {
    return false
  }
  if (hasNonImportNode) {
    return false
  }
  return true
}
