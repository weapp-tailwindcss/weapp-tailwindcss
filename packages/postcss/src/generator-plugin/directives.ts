import type { AtRule, Node, Root } from 'postcss'
import { parseCssImportSpecifier } from '../syntax/css-import'

const TAILWIND_ROOT_DIRECTIVE_NAMES = new Set([
  'config',
  'custom-variant',
  'plugin',
  'source',
  'tailwind',
  'theme',
  'utility',
  'variant',
])

export interface TailwindCssDirectiveOptions {
  importFallback?: boolean | undefined
}

export interface TailwindCssDirectiveAnalysisOptions extends TailwindCssDirectiveOptions {
  ignoreLayer?: boolean | undefined
}

export interface TailwindCssDirectiveAnalysis {
  hasLocalCssImport: boolean
  hasTailwindApplyDirective: boolean
  hasTailwindNonRootGenerationDirectives: boolean
  hasTailwindRootDirectives: boolean
  hasTailwindRootImportDirectives: boolean
  hasTailwindSourceDirectives: boolean
}

function createEmptyDirectiveAnalysis(): TailwindCssDirectiveAnalysis {
  return {
    hasLocalCssImport: false,
    hasTailwindApplyDirective: false,
    hasTailwindNonRootGenerationDirectives: false,
    hasTailwindRootDirectives: false,
    hasTailwindRootImportDirectives: false,
    hasTailwindSourceDirectives: false,
  }
}

export function parseTailwindCssDirectiveRequest(params: string) {
  return parseCssImportSpecifier(params)?.specifier
}

export function parseTailwindCssConfigRequest(params: string) {
  const match = /^(["'])(.+)\1\s*;?$/.exec(params.trim())
  return match?.[2]
}

export function isTailwindCssPackageJsonImportRequest(request: string | undefined) {
  return typeof request === 'string' && request.startsWith('#')
}

export function isWeappTailwindcssImportRequest(request: string | undefined) {
  return request === 'weapp-tailwindcss' || request?.startsWith('weapp-tailwindcss/') === true
}

export function normalizeTailwindCssImportRequest(request: string | undefined, options: TailwindCssDirectiveOptions = {}) {
  const normalized = options.importFallback && (request === 'weapp-tailwindcss' || request?.startsWith('weapp-tailwindcss/'))
    ? request.replace(/^weapp-tailwindcss/, 'tailwindcss')
    : request
  return normalized
}

export function isTailwindCssImportRequest(request: string | undefined, options: TailwindCssDirectiveOptions = {}) {
  const normalized = normalizeTailwindCssImportRequest(request, options)
  return normalized === 'tailwindcss'
    || normalized === 'tailwindcss4'
    || normalized?.startsWith('tailwindcss/') === true
    || normalized?.startsWith('tailwindcss4/') === true
}

export function isTailwindCssImportAtRule(node: AtRule, options: TailwindCssDirectiveOptions = {}) {
  if (node.name === 'tailwind') {
    return true
  }
  if (node.name !== 'import' && node.name !== 'use' && node.name !== 'forward') {
    return false
  }
  return isTailwindCssImportRequest(parseTailwindCssDirectiveRequest(node.params), options)
}

function getTailwindCssDirectiveRequest(node: AtRule) {
  return node.name === 'import'
    ? parseTailwindCssDirectiveRequest(node.params)
    : node.name === 'config' || node.name === 'plugin' || node.name === 'reference'
      ? parseTailwindCssConfigRequest(node.params)
      : undefined
}

export function isTailwindCssGenerationDirective(node: Node, options: TailwindCssDirectiveAnalysisOptions = {}) {
  if (node.type !== 'atrule') {
    return false
  }
  const atRule = node as AtRule
  const request = getTailwindCssDirectiveRequest(atRule)
  return isTailwindCssImportAtRule(atRule, options)
    || isTailwindCssPackageJsonImportRequest(request)
    || atRule.name === 'apply'
    || (!options.ignoreLayer && atRule.name === 'layer')
    || atRule.name === 'config'
    || atRule.name === 'source'
}

export function hasTailwindApplyDirective(css: string) {
  return /@apply\b/.test(css)
}

export function analyzeTailwindCssDirectives(root: Root, options: TailwindCssDirectiveAnalysisOptions = {}) {
  const analysis = createEmptyDirectiveAnalysis()

  root.walk((node) => {
    if (node.type !== 'atrule') {
      return
    }

    const atRule = node as AtRule
    if (atRule.name === 'import') {
      const request = parseTailwindCssDirectiveRequest(atRule.params)
      if (request?.startsWith('.') === true || request?.startsWith('/') === true) {
        analysis.hasLocalCssImport = true
      }
    }

    const isTailwindImport = isTailwindCssImportAtRule(atRule, options)
    if (isTailwindImport) {
      analysis.hasTailwindRootImportDirectives = true
      analysis.hasTailwindRootDirectives = true
    }

    const request = atRule.name === 'import' || atRule.name === 'config' || atRule.name === 'plugin'
      ? getTailwindCssDirectiveRequest(atRule)
      : undefined
    if (isTailwindImport || isTailwindCssPackageJsonImportRequest(request) || TAILWIND_ROOT_DIRECTIVE_NAMES.has(atRule.name)) {
      analysis.hasTailwindRootDirectives = true
    }

    if (atRule.name === 'apply') {
      analysis.hasTailwindApplyDirective = true
    }

    if (isTailwindCssGenerationDirective(atRule, options)) {
      analysis.hasTailwindSourceDirectives = true
      if (!isTailwindImport) {
        analysis.hasTailwindNonRootGenerationDirectives = true
      }
    }
  })

  return analysis
}

export function hasTailwindRootDirectives(root: Root, options: { importFallback?: boolean | undefined } = {}) {
  let found = false
  root.walkAtRules((rule) => {
    if (rule.name === 'import' && isTailwindCssImportRequest(parseTailwindCssDirectiveRequest(rule.params), options)) {
      found = true
      return false
    }
    if (TAILWIND_ROOT_DIRECTIVE_NAMES.has(rule.name)) {
      found = true
      return false
    }
  })
  return found
}
