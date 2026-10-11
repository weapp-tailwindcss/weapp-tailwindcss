import type { AtRule, Node, Root } from 'postcss'
import type { TailwindCssDirectiveOptions } from './directives'
import { postcss } from '../postcss-runtime'
import {
  isTailwindCssImportAtRule,
  isTailwindCssPackageJsonImportRequest,
  parseTailwindCssDirectiveRequest,
} from './directives'

const REMOTE_IMPORT_RE = /^(?:https?:)?\/\//i
const CSS_STYLE_EXTENSION_RE = /\.(?:css|wxss|acss|ttss|qss|jxss|tyss|scss|sass|less|styl|stylus|pcss|postcss)(?:$|[?#])/i
const SOURCE_STYLE_EXTENSION_RE = /\.(?:css|scss|sass|less|styl|stylus|pcss|postcss)(?:$|[?#])/i

const TAILWIND_REMOVABLE_SOURCE_DIRECTIVE_NAMES = new Set([
  'config',
  'custom-variant',
  'layer',
  'plugin',
  'reference',
  'source',
  'tailwind',
  'theme',
  'utility',
  'variant',
])

export interface RewriteLocalCssImportRequestOptions {
  styleOutputExtension?: string | undefined
}

export interface RestoreLocalCssImportOptions {
  outputFile?: string | undefined
}

export interface CollectCssImportRequestsRootOptions {
  isSupportedImportRequest?: ((request: string) => boolean) | undefined
}

export function createCssSourceOrderAppend(base: string, extra: string) {
  if (!base) {
    return extra
  }
  if (!extra) {
    return base
  }
  if (/\s$/.test(base) || /^\s/.test(extra)) {
    return `${base}${extra}`
  }
  return `${base}\n${extra}`
}

export function isLocalCssImportRequest(request: string) {
  return request.length > 0
    && !request.startsWith('#')
    && !request.startsWith('tailwindcss')
    && !request.startsWith('weapp-tailwindcss')
    && !request.startsWith('data:')
    && !REMOTE_IMPORT_RE.test(request)
}

export function isMiniProgramLocalCssImportRequest(request: string) {
  return request.length > 0
    && (request.startsWith('.') || request.startsWith('/'))
}

function parseImportRequest(params: string) {
  return parseTailwindCssDirectiveRequest(params)
}

function isLocalCssImportAtRule(node: AtRule) {
  const request = parseImportRequest(node.params)
  return request !== undefined && isLocalCssImportRequest(request)
}

interface RemoveTailwindSourceDirectivesOptions extends TailwindCssDirectiveOptions {
  /** Web 输出中的 layer 声明负责层叠排序，不能作为源指令清理。 */
  preserveCssLayers?: boolean | undefined
}

function isTailwindSourceDirective(node: Node, options: RemoveTailwindSourceDirectivesOptions = {}) {
  if (node.type !== 'atrule') {
    return false
  }
  const atRule = node as AtRule
  if (isTailwindCssImportAtRule(atRule, options)) {
    return true
  }
  if (atRule.name === 'import' && isTailwindCssPackageJsonImportRequest(parseImportRequest(atRule.params))) {
    return true
  }
  if (atRule.name === 'layer') {
    if (options.preserveCssLayers) {
      return false
    }
    return !atRule.nodes || atRule.nodes.length === 0
  }
  return TAILWIND_REMOVABLE_SOURCE_DIRECTIVE_NAMES.has(atRule.name)
}

export function removeTailwindSourceDirectivesRoot(root: Root, options: RemoveTailwindSourceDirectivesOptions = {}) {
  let removed = false
  root.walk((node) => {
    if (isTailwindSourceDirective(node, options)) {
      node.remove()
      removed = true
    }
  })
  return removed
}

export function isPureLocalCssImportWrapperRoot(root: Root) {
  let hasImport = false
  for (const node of root.nodes) {
    if (node.type === 'comment') {
      continue
    }
    if (node.type !== 'atrule' || node.name !== 'import' || !isLocalCssImportAtRule(node)) {
      return false
    }
    hasImport = true
  }
  return hasImport
}

export function collectCssImportRequestsRoot(root: Root, options: CollectCssImportRequestsRootOptions = {}) {
  const requests = new Set<string>()
  root.walkAtRules('import', (atRule) => {
    const request = parseImportRequest(atRule.params)
    if (request === undefined) {
      return
    }
    if (options.isSupportedImportRequest && !options.isSupportedImportRequest(request)) {
      return
    }
    requests.add(request)
  })
  return requests
}

export function removeUnsupportedMiniProgramCssImportsRoot(root: Root) {
  let changed = false
  root.walkAtRules('import', (atRule) => {
    const request = parseImportRequest(atRule.params)
    if (request === undefined || isMiniProgramLocalCssImportRequest(request)) {
      return
    }
    atRule.remove()
    changed = true
  })
  return changed
}

export function isPureLocalCssImportWrapper(css: string) {
  try {
    return isPureLocalCssImportWrapperRoot(postcss.parse(css))
  }
  catch {
    return false
  }
}

export function prefixLocalCssImportsWithWebpackIgnoreRoot(root: Root) {
  let changed = false
  root.walkAtRules('import', (atRule) => {
    if (isLocalCssImportAtRule(atRule)) {
      atRule.raws.before = `${atRule.raws.before ?? ''}/* webpackIgnore: true */\n`
      changed = true
    }
  })
  return changed
}

export function cleanLocalCssImportWrapperTailwindDirectivesRoot(root: Root) {
  let hasLocalImport = false
  let hasTailwindDirective = false
  for (const node of root.nodes) {
    if (node.type === 'comment') {
      continue
    }
    if (node.type === 'atrule' && node.name === 'import') {
      if (!isLocalCssImportAtRule(node)) {
        return false
      }
      hasLocalImport = true
      continue
    }
    if (node.type === 'atrule' && node.name === 'source') {
      hasTailwindDirective = true
      continue
    }
    return false
  }
  if (!hasLocalImport || !hasTailwindDirective) {
    return false
  }
  removeTailwindSourceDirectivesRoot(root)
  prefixLocalCssImportsWithWebpackIgnoreRoot(root)
  return true
}

export function cleanLocalCssImportWrapperTailwindDirectives(css: string) {
  try {
    const root = postcss.parse(css)
    return cleanLocalCssImportWrapperTailwindDirectivesRoot(root)
      ? root.toString()
      : undefined
  }
  catch {
    return undefined
  }
}

export function splitLocalCssImportsRoot(root: Root) {
  const importRoot = postcss.root()
  let changed = false
  for (const node of [...root.nodes]) {
    if (node.type !== 'atrule' || node.name !== 'import' || !isLocalCssImportAtRule(node)) {
      continue
    }
    importRoot.append(node.clone())
    node.remove()
    changed = true
  }
  const imports = importRoot.nodes
    .filter((node): node is AtRule => node.type === 'atrule' && node.name === 'import')
    .map(node => `@import ${node.params};`)
    .join('\n')
  return changed
    ? {
        imports,
        source: root.toString(),
      }
    : undefined
}

export function splitLocalCssImports(source: string) {
  try {
    return splitLocalCssImportsRoot(postcss.parse(source))
  }
  catch {
    return undefined
  }
}

export function removeMatchingLocalCssImportsRoot(root: Root, importsRoot: Root) {
  const requests = collectCssImportRequestsRoot(importsRoot, {
    isSupportedImportRequest: isLocalCssImportRequest,
  })
  if (requests.size === 0) {
    return false
  }

  let changed = false
  root.walkAtRules('import', (atRule) => {
    const request = parseImportRequest(atRule.params)
    if (!request || !requests.has(request)) {
      return
    }
    atRule.remove()
    changed = true
  })
  return changed
}

export function removeMatchingLocalCssImports(source: string, imports: string | undefined) {
  if (!imports?.includes('@import') || !source.includes('@import')) {
    return source
  }
  try {
    const root = postcss.parse(source)
    const importsRoot = postcss.parse(imports)
    return removeMatchingLocalCssImportsRoot(root, importsRoot) ? root.toString() : source
  }
  catch {
    return source
  }
}

function normalizeOutputPath(file: string) {
  const segments: string[] = []
  for (const segment of file.replace(/\\/g, '/').replace(/^\/+/, '').split('/')) {
    if (!segment || segment === '.') {
      continue
    }
    if (segment === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') {
        segments.pop()
      }
      else {
        segments.push(segment)
      }
      continue
    }
    segments.push(segment)
  }
  return segments.join('/')
}

function resolveOutputImportRequest(file: string, request: string) {
  const normalizedRequest = request.replace(/\\/g, '/')
  const { clean } = splitRequestSuffix(normalizedRequest)
  if (clean.startsWith('/')) {
    return normalizeOutputPath(clean)
  }
  const normalizedFile = normalizeOutputPath(file)
  const baseDir = normalizedFile.includes('/')
    ? normalizedFile.slice(0, normalizedFile.lastIndexOf('/'))
    : ''
  return normalizeOutputPath(baseDir ? `${baseDir}/${clean}` : clean)
}

function isSelfOutputImport(outputFile: string, node: Node) {
  if (node.type !== 'atrule' || node.name !== 'import') {
    return false
  }
  const request = parseImportRequest(node.params)
  return request !== undefined
    && isLocalCssImportRequest(request)
    && resolveOutputImportRequest(outputFile, request) === normalizeOutputPath(outputFile)
}

function filterSelfOutputImports(imports: string, outputFile: string | undefined) {
  if (!outputFile) {
    return imports
  }
  try {
    const root = postcss.parse(imports)
    let changed = false
    root.walk((node) => {
      if (isSelfOutputImport(outputFile, node)) {
        node.remove()
        changed = true
      }
    })
    return changed ? root.toString() : imports
  }
  catch {
    return imports
  }
}

export function restoreLocalCssImports(css: string, imports: string | undefined, options: RestoreLocalCssImportOptions = {}) {
  if (!imports?.trim()) {
    return css
  }
  const filteredImports = filterSelfOutputImports(imports, options.outputFile)
  if (!filteredImports.trim()) {
    return css
  }
  return createCssSourceOrderAppend(filteredImports, css)
}

function splitRequestSuffix(request: string) {
  const queryIndex = request.indexOf('?')
  const hashIndex = request.indexOf('#')
  const suffixIndexCandidates = [queryIndex, hashIndex].filter(index => index >= 0)
  const suffixIndex = suffixIndexCandidates.length > 0 ? Math.min(...suffixIndexCandidates) : -1
  if (suffixIndex < 0) {
    return {
      clean: request,
      suffix: '',
    }
  }
  return {
    clean: request.slice(0, suffixIndex),
    suffix: request.slice(suffixIndex),
  }
}

export function normalizeOutputImportRequest(request: string, styleOutputExtension: string | undefined) {
  const normalizedStyleOutputExtension = styleOutputExtension?.startsWith('.')
    ? styleOutputExtension
    : styleOutputExtension
      ? `.${styleOutputExtension}`
      : undefined
  const { clean, suffix } = splitRequestSuffix(request.replace(/\\/g, '/'))
  const normalized = clean
    .replace(/^(?:\.\/)?src\//, './')
    .replace(SOURCE_STYLE_EXTENSION_RE, normalizedStyleOutputExtension ?? '.css')
  return `${normalized}${suffix}`
}

export function rewriteLocalCssImportRequestsForOutputRoot(
  root: Root,
  options: RewriteLocalCssImportRequestOptions = {},
) {
  let changed = false
  root.walkAtRules('import', (atRule) => {
    const request = parseImportRequest(atRule.params)
    if (!request || !isLocalCssImportRequest(request) || !CSS_STYLE_EXTENSION_RE.test(request)) {
      return
    }
    const rewritten = normalizeOutputImportRequest(request, options.styleOutputExtension)
    if (rewritten === request) {
      return
    }
    atRule.params = atRule.params.replace(request, rewritten)
    changed = true
  })
  return changed
}

export function rewriteLocalCssImportRequestsForOutput(
  css: string,
  options: RewriteLocalCssImportRequestOptions = {},
) {
  if (!css.includes('@import')) {
    return css
  }
  try {
    const root = postcss.parse(css)
    return rewriteLocalCssImportRequestsForOutputRoot(root, options) ? root.toString() : css
  }
  catch {
    return css
  }
}
