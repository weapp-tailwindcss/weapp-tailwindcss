import fs from 'node:fs/promises'
import nodePath from 'node:path'
import { isCssSourceTraceComment } from '@weapp-tailwindcss/postcss/transform'
import path from 'pathe'
import postcss from 'postcss'
import prettier from 'prettier'
import { relativeGeneratedCssSource } from './snapshot/source-path'

export interface CssSnapshotEntry {
  fileName: string
  content: string
}

export interface CssTokenSource {
  token: string
  sources: string[]
}

export interface CssSnapshotOptions {
  classList?: string[]
  generatedCssSourceRoot?: string
  normalizeWebpackAppSplitNoise?: boolean
  normalizeTailwindV4RootVariableNoise?: boolean
  rootSnapshotName?: string
  tokenSources?: Map<string, CssTokenSource> | Record<string, CssTokenSource | string[]>
}

async function exists(target: string) {
  try {
    await fs.access(target)
    return true
  }
  catch {
    return false
  }
}

export function sanitizeImportRequest(request: string): string {
  const withoutQuery = request.split('?')[0] ?? ''
  const withoutHash = withoutQuery.split('#')[0] ?? ''
  return withoutHash.trim()
}

const PATH_SEPARATOR_RE = /[/\\]+/
const HASH_IN_FILENAME_RE = /[.-]?[a-f0-9]{8}(?=\.[^.]+$)/i
const HASH_IN_PATH_SEGMENT_RE = /[.-]?[a-f0-9]{8}$/i

export function stripHashFromFilename(name: string): string {
  const segments = name.split(PATH_SEPARATOR_RE)
  const normalizedSegments = segments.map((segment, index) => {
    if (index !== segments.length - 1) {
      return segment
    }
    return segment.replace(HASH_IN_FILENAME_RE, '')
  })
  return normalizedSegments.join(path.sep)
}

export function stripHashFromPathSegment(name: string): string {
  return stripHashFromFilename(name)
    .split(PATH_SEPARATOR_RE)
    .map(segment => segment.replace(HASH_IN_PATH_SEGMENT_RE, ''))
    .join(path.sep)
}

export function normalizeSnapshotName(name: string): string | undefined {
  const segments = name.split(PATH_SEPARATOR_RE).filter(segment => segment.length > 0 && segment !== '.')
  if (segments.length === 0) {
    return undefined
  }
  const normalizedSegments = segments.map(stripHashFromPathSegment)
  return normalizedSegments.join(path.sep)
}

export function safeRelative(from: string, to: string): string | undefined {
  const relativePath = path.relative(from, to)
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return undefined
  }
  return relativePath
}

const PROTOCOL_RE = /^(?:https?:)?\/\//i
const BACKSLASH_RE = /\\/g

export function resolveCssImport(projectRoot: string, fromFile: string, request: string): string | undefined {
  const cleaned = sanitizeImportRequest(request)
  if (!cleaned || cleaned.startsWith('~')) {
    return undefined
  }
  if (PROTOCOL_RE.test(cleaned) || cleaned.startsWith('data:')) {
    return undefined
  }

  const fromDir = path.dirname(fromFile)
  const normalizedRequest = cleaned.replace(BACKSLASH_RE, '/')

  const target = normalizedRequest.startsWith('/')
    ? path.resolve(projectRoot, `.${normalizedRequest}`)
    : path.resolve(fromDir, normalizedRequest)

  return target
}

export function computeSnapshotName(projectRoot: string, fromFile: string, targetFile: string): string | undefined {
  const fromDir = path.dirname(fromFile)

  const relativeFromCurrent = safeRelative(fromDir, targetFile)
  if (relativeFromCurrent) {
    const normalized = normalizeSnapshotName(relativeFromCurrent)
    if (normalized) {
      return normalized
    }
  }

  const relativeFromProject = safeRelative(projectRoot, targetFile)
  if (relativeFromProject) {
    const normalized = normalizeSnapshotName(relativeFromProject)
    if (normalized) {
      return normalized
    }
  }

  return stripHashFromFilename(path.basename(targetFile))
}

const CSS_IMPORT_EXTRACT_RE = /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^"'()\s]+))\s*\)?/gi

export function extractCssImports(source: string): string[] {
  const pattern = new RegExp(CSS_IMPORT_EXTRACT_RE.source, CSS_IMPORT_EXTRACT_RE.flags)
  const imports: string[] = []
  while (true) {
    const match = pattern.exec(source)
    if (!match) {
      break
    }
    const request = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (request.length === 0) {
      continue
    }
    imports.push(request)
  }
  return imports
}

export const TAILWIND_BANNER = /^\s*\/\*! tailwindcss v[\d.]+ \| MIT License \| https:\/\/tailwindcss\.com \*\/\s*/i

export function stripTailwindBanner(source: string) {
  return source.replace(TAILWIND_BANNER, '')
}

const CSS_IMPORT_NORMALIZE_RE = /@import\s+(url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^"'()\s]+))(\s*\))?/gi

export function normalizeCssImports(source: string) {
  const pattern = new RegExp(CSS_IMPORT_NORMALIZE_RE.source, CSS_IMPORT_NORMALIZE_RE.flags)
  return source.replace(pattern, (match, urlPrefix, d1, d2, d3, urlSuffix = '') => {
    const request = (d1 ?? d2 ?? d3 ?? '').trim()
    if (request.length === 0) {
      return match
    }
    const cleaned = sanitizeImportRequest(request)
    const normalizedRequest = stripHashFromFilename(cleaned)
    if (normalizedRequest === request) {
      return match
    }
    const quote = d1 !== undefined ? '"' : d2 !== undefined ? '\'' : ''
    const prefix = urlPrefix ?? ''
    const suffix = urlSuffix ?? ''
    return `@import ${prefix}${quote}${normalizedRequest}${quote}${suffix}`
  })
}

export async function formatCss(css: string) {
  return prettier.format(css, {
    parser: 'css',
    tabWidth: 2,
    useTabs: false,
    semi: false,
    singleQuote: true,
    endOfLine: 'lf',
    trailingComma: 'none',
    printWidth: 180,
    bracketSameLine: true,
    htmlWhitespaceSensitivity: 'ignore',
  })
}

const FONT_DATA_URL_RE = /url\(\s*(["']?)data:font\/([^;,'")\s]+)(?:;charset=[^;,'")\s]+)?;base64,[^'")\s]+(["']?)\s*\)/gi

export function normalizeFontDataUrlsForSnapshot(source: string) {
  return source.replace(FONT_DATA_URL_RE, (match, openQuote, fontType, closeQuote) => {
    if (openQuote !== closeQuote) {
      return match
    }
    return `url(${openQuote}data:font/${fontType};base64,<stable>${closeQuote})`
  })
}

const GENERATED_CSS_SOURCE_MARKER_RE = /(\/\*!\s*weapp-tailwindcss vite-generated-css(?:-end)?:)([^\s*]+)(\s*\*\/)/g

export function normalizeGeneratedCssSourceMarkers(source: string, projectRoot: string) {
  const withoutTrailingSourceMedia = source.replace(/\n\s*@media\s+source\([^)]*\)\s*\{\s*$/, '')
  return withoutTrailingSourceMedia.replace(GENERATED_CSS_SOURCE_MARKER_RE, (marker, prefix, encodedSource, suffix) => {
    try {
      const sourceFile = decodeURIComponent(encodedSource)
      const relativeSource = relativeGeneratedCssSource(projectRoot, sourceFile)
      if (!relativeSource) {
        return marker
      }
      const stableSource = nodePath.posix.join('<project-root>', relativeSource)
      return `${prefix}${encodeURIComponent(stableSource)}${suffix}`
    }
    catch {
      return marker
    }
  })
}

export function normalizeFormattedCssSnapshot(source: string) {
  return source
    .replace(/\}\s+(\/\*!?\s*tokens?:)/g, '}\n$1')
    .replace(/^[ \t]*(\/\*!?\s*tokens?:)/gm, ' $1')
    .replace(/\n{2,}(?=(?:view|text|:{1,2}after|:{1,2}before|:host|page|\.tw-root|wx-root-portal-content)[\s,{])/g, '\n')
}

export function normalizeCssTextSnapshot(source: string, options: CssSnapshotOptions = {}) {
  const withoutBanner = stripTailwindBanner(source)
  const normalizedImports = normalizeCssImports(withoutBanner)
  const normalizedCss = normalizeCssSnapshot(normalizedImports, options)
  return normalizeFormattedCssSnapshot(normalizedCss)
    .trimEnd()
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
}

export function normalizeRawCssSnapshotText(source: string, options: CssSnapshotOptions = {}) {
  if (Object.keys(options).length > 0) {
    return `${normalizeCssTextSnapshot(source, options)}\n`
  }
  return `${normalizeCssImports(source.replace(/\r\n/g, '\n')).trimEnd().split('\n').map(line => line.trimEnd()).join('\n')}\n`
}

export async function formatRawCssSnapshotText(source: string, options: CssSnapshotOptions = {}) {
  const normalizedSource = normalizeFontDataUrlsForSnapshot(source.replace(/\r\n/g, '\n'))
  try {
    return normalizeRawCssSnapshotText(await formatCss(normalizedSource), options)
  }
  catch {
    return `${normalizeCssTextSnapshot(normalizedSource, options)}\n`
  }
}

const SCANNER_NOISE_SELECTORS = new Set([
  '.start',
  '.end',
  '.border-bs',
  '.border-be',
])

const TAILWIND_V4_DEFAULT_TOKEN_PROPS = new Set([
  '--color-gray-200',
  '--color-gray-400',
  '--blur',
  '--drop-shadow',
  '--radius',
  '--backdrop-blur',
])

const TAILWIND_V4_ROOT_VARIABLE_NOISE_PROPS = new Set([
  '--tw-rotate-x',
  '--tw-rotate-y',
  '--tw-rotate-z',
  '--tw-skew-x',
  '--tw-skew-y',
  '--tw-border-style',
  '--tw-gradient-position',
  '--tw-gradient-from',
  '--tw-gradient-via',
  '--tw-gradient-to',
  '--tw-gradient-stops',
  '--tw-gradient-via-stops',
  '--tw-gradient-from-position',
  '--tw-gradient-via-position',
  '--tw-gradient-to-position',
  '--tw-shadow',
  '--tw-shadow-color',
  '--tw-shadow-alpha',
  '--tw-inset-shadow',
  '--tw-inset-shadow-color',
  '--tw-inset-shadow-alpha',
  '--tw-ring-color',
  '--tw-ring-shadow',
  '--tw-inset-ring-color',
  '--tw-inset-ring-shadow',
  '--tw-ring-inset',
  '--tw-ring-offset-width',
  '--tw-ring-offset-color',
  '--tw-ring-offset-shadow',
  '--tw-outline-style',
  '--tw-blur',
  '--tw-brightness',
  '--tw-contrast',
  '--tw-grayscale',
  '--tw-hue-rotate',
  '--tw-invert',
  '--tw-opacity',
  '--tw-saturate',
  '--tw-sepia',
  '--tw-drop-shadow',
  '--tw-drop-shadow-color',
  '--tw-drop-shadow-alpha',
  '--tw-drop-shadow-size',
  '--tw-ease',
])

const TAILWIND_V4_COLOR_VALUE_COMPAT = new Map([
  ['#06b6d4', 'rgb(0, 182, 212)'],
  ['#3b82f6', 'rgb(50, 128, 255)'],
  ['#d8b4fe', 'rgb(216, 180, 255)'],
  ['#ef4444', 'rgb(251, 44, 54)'],
  ['#22c55e', 'rgb(0, 198, 90)'],
  ['#059669', 'rgb(0, 150, 105)'],
  ['#d946ef', 'rgb(225, 42, 251)'],
  ['#f43f5e', 'rgb(255, 35, 87)'],
  ['#f3f4f6', 'rgb(243, 244, 246)'],
  ['#27272a', 'rgb(39, 39, 42)'],
  ['#fafafa', 'rgb(250, 250, 250)'],
  ['#18181b', 'rgb(24, 24, 27)'],
  ['#b91c1c', 'rgb(191, 0, 15)'],
  ['#fcd34d', 'rgb(255, 210, 55)'],
  ['#86efac', 'rgb(123, 241, 168)'],
  ['#bfdbfe', 'rgb(190, 219, 255)'],
  ['#93c5fd', 'rgb(145, 197, 255)'],
  ['#f9a8d4', 'rgb(253, 165, 213)'],
  ['#f8fafc', 'rgb(248, 250, 252)'],
  ['#e2e8f0', 'rgb(226, 232, 240)'],
  ['#64748b', 'rgb(98, 116, 142)'],
  ['#1e293b', 'rgb(29, 41, 61)'],
  ['#0f172a', 'rgb(15, 23, 43)'],
  ['#ecfdf5', 'rgb(236, 253, 245)'],
  ['#d1fae5', 'rgb(208, 250, 229)'],
  ['#10b981', 'rgb(0, 185, 129)'],
])

const TAILWIND_V4_COLOR_RGBA_COMPAT = new Map([
  ['rgba(59, 130, 246, 0.3)', 'rgba(50, 128, 255, 0.3)'],
])

const WEAPP_ROOT_SELECTOR = ':host, page, .tw-root, wx-root-portal-content'
const WEAPP_ROOT_SELECTOR_PARTS = new Set([':host', 'page', '.tw-root', 'wx-root-portal-content'])

const WEBPACK_APP_SPLIT_NOISE_KEYFRAMES = new Set(['float-pop', 'jump'])
const WEBPACK_APP_SPLIT_NOISE_FONT_FAMILIES = new Set(['JDZH-Regular', 'JDZH-Bold'])
const WEBPACK_APP_SPLIT_NOISE_ROOT_DECLS = new Set([
  '--animate-delay',
  '--animate-duration',
  '--nut-icon-color',
  '--nut-icon-height',
  '--nut-icon-line-height',
  '--nut-icon-width',
])
const SUBPACKAGE_MARKER_SELECTOR_RE = /^\.bg-(?:independent|normal)-subpackage-marker$|^\.before_ccontent-_b_a(?:independent|normal)_subpackage_/

const TAILWIND_V4_APP_COLOR_ORDER = new Map([
  '--color-red-700',
  '--color-amber-300',
  '--color-green-300',
  '--color-blue-200',
  '--color-blue-300',
  '--color-blue-500',
  '--color-pink-300',
  '--color-zinc-50',
  '--color-zinc-900',
].map((prop, index) => [prop, index]))

const TAILWIND_V4_DEFAULT_COLOR_ORDER = new Map([
  '--color-red-500',
  '--color-green-500',
  '--color-emerald-50',
  '--color-emerald-100',
  '--color-emerald-500',
  '--color-emerald-600',
  '--color-cyan-500',
  '--color-blue-500',
  '--color-slate-50',
  '--color-slate-200',
  '--color-slate-500',
  '--color-slate-800',
  '--color-slate-900',
  '--color-fuchsia-500',
  '--color-rose-500',
  '--color-gray-100',
  '--color-zinc-800',
  '--color-white',
  '--color-purple-300',
  '--color-purple-800',
  '--color-pink-200',
].map((prop, index) => [prop, index]))

const DEDUPED_CSS_SNAPSHOT_COMMENTS = new Set([
  'Core plugin extractor sources are intentionally not loaded here.',
  'stylelint-disable custom-property-pattern',
])

function isTailwindV4Css(root: postcss.Root) {
  let matched = false
  root.walkDecls('--spacing', () => {
    matched = true
    return false
  })
  return matched
}

function hasWeappEscapedArbitrarySelector(root: postcss.Root) {
  let matched = false
  root.walkRules((rule) => {
    if (/_b[^{}]*_B/.test(rule.selector)) {
      matched = true
      return false
    }
  })
  return matched
}

function getUtilityGroup(selector: string) {
  if (SUBPACKAGE_MARKER_SELECTOR_RE.test(selector)) {
    return 'subpackage-marker'
  }
  if (/^(?:\.text(?:-|_)|\._etext)/.test(selector)) {
    return 'typography'
  }
  if (/^(?:\.leading(?:-|_)|\._eleading)/.test(selector)) {
    return 'typography'
  }
  if (/^(?:\.font(?:-|_)|\._efont)/.test(selector)) {
    return 'typography'
  }
  if (/^(?:\.border(?:-|$)|\._eborder)/.test(selector)) {
    return 'border'
  }
}

function getTypographyRank(rule: postcss.Rule) {
  if (/^(?:\.text(?:-|_)|\._etext)/.test(rule.selector)) {
    let rank = 40
    rule.walkDecls((decl) => {
      if (decl.prop === 'font-size' || decl.prop === 'text-align') {
        rank = Math.min(rank, 10)
      }
    })
    return rank
  }
  if (/^(?:\.leading(?:-|_)|\._eleading)/.test(rule.selector)) {
    return 20
  }
  if (/^(?:\.font(?:-|_)|\._efont)/.test(rule.selector)) {
    return 30
  }
  return 50
}

function compareUtilityRules(a: postcss.ChildNode, b: postcss.ChildNode) {
  const selectorA = a.type === 'rule' ? a.selector : ''
  const selectorB = b.type === 'rule' ? b.selector : ''
  const group = getUtilityGroup(selectorA)
  if (group === 'typography' && a.type === 'rule' && b.type === 'rule') {
    return getTypographyRank(a) - getTypographyRank(b) || compareText(selectorA, selectorB) || compareText(a.toString(), b.toString())
  }
  return compareText(selectorA, selectorB) || compareText(a.toString(), b.toString())
}

function compareText(a: string, b: string) {
  if (a < b) {
    return -1
  }
  if (a > b) {
    return 1
  }
  return 0
}

function sortUtilityRuleRuns(container: postcss.Container) {
  const nodes = container.nodes
  if (!nodes) {
    return
  }

  for (const node of nodes) {
    if ('nodes' in node) {
      sortUtilityRuleRuns(node as postcss.Container)
    }
  }

  let index = 0
  while (index < nodes.length) {
    const node = nodes[index]
    if (node?.type !== 'rule') {
      index += 1
      continue
    }

    const group = getUtilityGroup(node.selector)
    if (!group) {
      index += 1
      continue
    }

    let end = index + 1
    while (end < nodes.length) {
      const next = nodes[end]
      if (next?.type !== 'rule' || getUtilityGroup(next.selector) !== group) {
        break
      }
      end += 1
    }

    if (end - index > 1) {
      const firstBefore = nodes[index]?.raws.before
      const sorted = nodes
        .slice(index, end)
        .sort(compareUtilityRules)
      sorted.forEach((node, offset) => {
        node.raws.before = offset === 0 ? firstBefore : '\n'
      })
      nodes.splice(index, end - index, ...sorted)
    }

    index = end
  }
}

function sortSubpackageMarkerChunks(container: postcss.Container) {
  const nodes = container.nodes
  if (!nodes) {
    return
  }

  for (const node of nodes) {
    if ('nodes' in node) {
      sortSubpackageMarkerChunks(node as postcss.Container)
    }
  }

  const chunks: Array<{ end: number, nodes: postcss.ChildNode[], rule: postcss.Rule, start: number }> = []
  let index = 0
  while (index < nodes.length) {
    const node = nodes[index]
    const next = nodes[index + 1]
    if (
      node?.type === 'comment'
      && isCssSourceTraceComment(node.text)
      && next?.type === 'rule'
      && SUBPACKAGE_MARKER_SELECTOR_RE.test(next.selector)
    ) {
      chunks.push({
        start: index,
        end: index + 2,
        nodes: [node, next],
        rule: next,
      })
      index += 2
      continue
    }
    if (node?.type === 'rule' && SUBPACKAGE_MARKER_SELECTOR_RE.test(node.selector)) {
      chunks.push({
        start: index,
        end: index + 1,
        nodes: [node],
        rule: node,
      })
    }
    index += 1
  }

  if (chunks.length <= 1) {
    return
  }

  const sortedChunks = [...chunks].sort((a, b) => compareUtilityRules(a.rule, b.rule))
  let offset = 0
  for (const [slotIndex, chunk] of chunks.entries()) {
    const replacement = sortedChunks[slotIndex]
    if (!replacement) {
      continue
    }
    const replacementNodes = replacement.nodes.map(node => node.clone())
    const firstNode = replacementNodes[0]
    if (firstNode) {
      firstNode.raws.before = chunk.nodes[0]?.raws.before
    }
    nodes.splice(chunk.start + offset, chunk.end - chunk.start, ...replacementNodes)
    offset += replacementNodes.length - (chunk.end - chunk.start)
  }
}

function normalizeNodeSpacing(root: postcss.Root) {
  root.walk((node) => {
    if (node.raws.before && node.raws.before.includes('\n\n')) {
      node.raws.before = '\n'
    }
  })
}

function removeTailwindV4DefaultTokenNoise(root: postcss.Root) {
  root.walkDecls((decl) => {
    if (TAILWIND_V4_DEFAULT_TOKEN_PROPS.has(decl.prop)) {
      decl.remove()
    }
  })
}

function normalizeSelectorPart(selector: string) {
  return selector
    .replace(/:not\(#(?:\\#|n)\)/g, '')
    .replace(/(?<![:\\]):(before|after)\b/g, '::$1')
    .trim()
}

function isSelectorSet(rule: postcss.Rule, expected: Set<string>) {
  const selectors = new Set(rule.selectors.map(normalizeSelectorPart))
  return selectors.size === expected.size
    && [...selectors].every(selector => expected.has(selector))
}

function normalizeWeappRootRules(root: postcss.Root, options: CssSnapshotOptions) {
  if (!options.normalizeWebpackAppSplitNoise) {
    return
  }

  const hasNutIconSplitNoise = root.some((node) => {
    return node.type === 'rule'
      && node.selectors.some(selector => normalizeSelectorPart(selector).startsWith('.nut-icon'))
  })

  root.walkAtRules((rule) => {
    if (
      /keyframes$/i.test(rule.name)
      && (
        WEBPACK_APP_SPLIT_NOISE_KEYFRAMES.has(rule.params)
        || rule.params.startsWith('nut')
        || (hasNutIconSplitNoise && rule.params === 'rotation')
      )
    ) {
      rule.remove()
    }
  })

  let hasWebpackAppSplitNoise = hasNutIconSplitNoise
  root.walkAtRules('font-face', (rule) => {
    rule.walkDecls('font-family', (decl) => {
      const fontFamily = decl.value.replaceAll(/["']/g, '')
      if (fontFamily.startsWith('JDZH-')) {
        hasWebpackAppSplitNoise = true
      }
    })
  })
  if (!hasWebpackAppSplitNoise) {
    return
  }

  if (hasNutIconSplitNoise) {
    root.walkRules((rule) => {
      if (rule.selectors.every(selector => normalizeSelectorPart(selector).startsWith('.nut-icon'))) {
        rule.remove()
      }
    })
  }

  root.walkAtRules((rule) => {
    if (rule.name === 'font-face') {
      let shouldNormalizeFont = false
      rule.walkDecls('font-family', (decl) => {
        const fontFamily = decl.value.replaceAll(/["']/g, '')
        shouldNormalizeFont ||= WEBPACK_APP_SPLIT_NOISE_FONT_FAMILIES.has(fontFamily)
      })
      if (shouldNormalizeFont) {
        rule.walkDecls('src', (decl) => {
          decl.value = 'url(data:font/ttf;base64,<stable>) format("truetype")'
        })
      }
    }
  })

  const rootRules: postcss.Rule[] = []
  root.walkRules((rule) => {
    if (isSelectorSet(rule, WEAPP_ROOT_SELECTOR_PARTS)) {
      rootRules.push(rule)
    }
  })

  const firstRootRule = rootRules[0]
  if (!firstRootRule) {
    return
  }

  firstRootRule.selector = WEAPP_ROOT_SELECTOR
  const seen = new Set<string>()
  firstRootRule.walkDecls((decl) => {
    if (WEBPACK_APP_SPLIT_NOISE_ROOT_DECLS.has(decl.prop)) {
      decl.remove()
      return
    }
    seen.add(`${decl.prop}\0${decl.value}`)
  })

  for (const rule of rootRules.slice(1)) {
    const movableDecls = rule.nodes?.filter((node): node is postcss.Declaration => node.type === 'decl' && node.prop.startsWith('--')) ?? []
    if (movableDecls.length !== rule.nodes?.filter(node => node.type === 'decl').length) {
      continue
    }

    for (const decl of movableDecls) {
      if (WEBPACK_APP_SPLIT_NOISE_ROOT_DECLS.has(decl.prop)) {
        decl.remove()
        continue
      }
      const key = `${decl.prop}\0${decl.value}`
      decl.remove()
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      firstRootRule.append(decl)
    }
    if (!rule.nodes || rule.nodes.length === 0) {
      rule.remove()
    }
  }
}

function getColorOrder(colorDeclarations: postcss.Declaration[]) {
  const hasDefaultColorSet = colorDeclarations.some(decl =>
    decl.prop === '--color-red-500'
    || decl.prop === '--color-green-500'
    || decl.prop === '--color-emerald-600'
    || decl.prop === '--color-cyan-500'
    || decl.prop === '--color-fuchsia-500'
    || decl.prop === '--color-rose-500'
    || decl.prop === '--color-gray-100'
    || decl.prop === '--color-zinc-800',
  )
  if (hasDefaultColorSet) {
    return TAILWIND_V4_DEFAULT_COLOR_ORDER
  }

  const hasAppColorSet = colorDeclarations.some(decl =>
    decl.prop === '--color-red-700'
    || decl.prop === '--color-amber-300'
    || decl.prop === '--color-green-300'
    || decl.prop === '--color-blue-200'
    || decl.prop === '--color-blue-300'
    || decl.prop === '--color-pink-300'
    || decl.prop === '--color-zinc-50'
    || decl.prop === '--color-zinc-900',
  )
  return hasAppColorSet ? TAILWIND_V4_APP_COLOR_ORDER : TAILWIND_V4_DEFAULT_COLOR_ORDER
}

function normalizeTailwindV4ColorOutput(root: postcss.Root) {
  const compatColorDeclarations = new WeakSet<postcss.Declaration>()

  root.walkDecls((decl) => {
    const compatColor = TAILWIND_V4_COLOR_VALUE_COMPAT.get(decl.value.toLowerCase())
    if (decl.prop.startsWith('--color-') && compatColor) {
      decl.value = compatColor
      compatColorDeclarations.add(decl)
      return
    }

    const compatRgba = TAILWIND_V4_COLOR_RGBA_COMPAT.get(decl.value.toLowerCase())
    if (compatRgba) {
      decl.value = compatRgba
    }
  })

  root.walkRules((rule) => {
    const declarations = rule.nodes?.filter((node): node is postcss.Declaration => node.type === 'decl') ?? []
    const convertedColorDeclarations = declarations.filter(decl => compatColorDeclarations.has(decl))
    const colorDeclarations = convertedColorDeclarations.length > 0
      ? declarations.filter(decl => compatColorDeclarations.has(decl) || TAILWIND_V4_DEFAULT_COLOR_ORDER.has(decl.prop) || TAILWIND_V4_APP_COLOR_ORDER.has(decl.prop))
      : convertedColorDeclarations
    if (colorDeclarations.length === 0) {
      return
    }

    const fontAnchor = declarations.findLast(decl => decl.prop === '--font-mono')
    if (!fontAnchor) {
      return
    }

    const colorOrder = getColorOrder(colorDeclarations)
    const sortedColorDeclarations = [...colorDeclarations].sort((a, b) => {
      const rankA = colorOrder.get(a.prop) ?? Number.MAX_SAFE_INTEGER
      const rankB = colorOrder.get(b.prop) ?? Number.MAX_SAFE_INTEGER
      return rankA - rankB
    })

    let anchor: postcss.Container | postcss.ChildNode = fontAnchor
    for (const decl of sortedColorDeclarations) {
      decl.remove()
      rule.insertAfter(anchor, decl)
      anchor = decl
    }
  })
}

function normalizeTailwindV4DefaultTokenUsage(root: postcss.Root) {
  root.walkDecls((decl) => {
    const parentSelector = decl.parent?.type === 'rule' ? decl.parent.selector : ''
    if (decl.prop === '--tw-gradient-position' && parentSelector === '.bg-linear-to-r' && decl.value.endsWith('in oklab')) {
      decl.value = decl.value.slice(0, -'in oklab'.length).trimEnd()
      return
    }
    if (decl.value.includes('rgba(0, 0, 0, 0.10196)')) {
      decl.value = decl.value.replaceAll('rgba(0, 0, 0, 0.10196)', 'rgba(0, 0, 0, 0.1)')
    }
    if (decl.value.includes('var(--radius)')) {
      decl.value = decl.value.replaceAll('var(--radius)', '8rpx')
      return
    }
    if (decl.value.includes('var(--blur)')) {
      decl.value = decl.value.replaceAll('var(--blur)', '8px')
      return
    }
    if (decl.value.includes('var(--backdrop-blur)')) {
      decl.value = decl.value.replaceAll('var(--backdrop-blur)', '8px')
      return
    }
    if ((decl.prop === '--tw-blur' || decl.prop === '--tw-backdrop-blur') && decl.value === 'blur(8rpx)') {
      decl.value = 'blur(8px)'
      return
    }
    if (decl.prop === 'outline-width' && (decl.value === '3px' || decl.value === '3rpx' || decl.value === '1px' || decl.value === '1rpx')) {
      decl.value = '1px'
      return
    }
    if (decl.prop === '--tw-shadow' && /^0 1(?:rpx|px) (?:2|3)(?:rpx|px) /.test(decl.value)) {
      decl.value = decl.value.includes('var(--tw-shadow-color')
        ? '0 1px 3px 0 var(--tw-shadow-color, rgba(0, 0, 0, 0.1)), 0 1px 2px -1px var(--tw-shadow-color, rgba(0, 0, 0, 0.1))'
        : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)'
      return
    }
    if (
      decl.prop === '--tw-drop-shadow'
      && (
        decl.value === 'drop-shadow(var(--drop-shadow))'
        || decl.value === 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1)) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.06))'
        || decl.value === 'drop-shadow(0 1rpx 2rpx rgba(0, 0, 0, 0.1)) drop-shadow(0 1rpx 1rpx rgba(0, 0, 0, 0.06))'
      )
    ) {
      decl.value = 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1)) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.06))'
      return
    }
    if (decl.prop === '--tw-ring-shadow') {
      decl.value = decl.value
        .replace(
          'calc(3px + var(--tw-ring-offset-width)) var(--tw-ring-color, var(--color-blue-500, #3b82f6))',
          'calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color, currentcolor)',
        )
        .replace(
          'calc(3rpx + var(--tw-ring-offset-width)) var(--tw-ring-color, var(--color-blue-500, #3b82f6))',
          'calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color, currentcolor)',
        )
        .replace(
          'calc(3px + var(--tw-ring-offset-width)) var(--tw-ring-color)',
          'calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color)',
        )
        .replace(
          'calc(3rpx + var(--tw-ring-offset-width)) var(--tw-ring-color)',
          'calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color)',
        )
        .replace(
          'calc(1rpx + var(--tw-ring-offset-width)) var(--tw-ring-color, currentcolor)',
          'calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color, currentcolor)',
        )
        .replace(
          'calc(1rpx + var(--tw-ring-offset-width)) var(--tw-ring-color)',
          'calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color)',
        )
    }
  })
}

function normalizeCalcWrapperValues(root: postcss.Root) {
  root.walkDecls((decl) => {
    const prefix = ' * calc(1 - var(--'
    if (!decl.value.includes(prefix)) {
      return
    }

    const [sizePart, rest] = decl.value.split(prefix)
    if (!sizePart?.startsWith('calc(') || rest === undefined || !rest.endsWith(')))')) {
      return
    }

    const size = sizePart.slice('calc('.length).trim()
    const variableName = rest.slice(0, -')))'.length).trim()
    if (!size || !variableName) {
      return
    }

    decl.value = `calc(${size} * (1 - var(--${variableName})))`
  })
}

function dedupeExactDeclarations(root: postcss.Root) {
  root.walkRules((rule) => {
    const seen = new Set<string>()
    // 保留最后一次声明，且不跨越嵌套规则或条件边界改变层叠顺序。
    for (const decl of [...rule.nodes].reverse()) {
      if (decl.type !== 'decl') {
        continue
      }
      const key = `${decl.prop}\0${decl.value}\0${decl.important ? '1' : '0'}`
      if (seen.has(key)) {
        decl.remove()
        continue
      }
      seen.add(key)
    }
  })
}

function removeTailwindV4RootVariableNoise(root: postcss.Root, options: CssSnapshotOptions) {
  if (!options.normalizeTailwindV4RootVariableNoise) {
    return
  }

  root.walkRules((rule) => {
    if (isSelectorSet(rule, WEAPP_ROOT_SELECTOR_PARTS)) {
      rule.walkDecls((decl) => {
        if (TAILWIND_V4_ROOT_VARIABLE_NOISE_PROPS.has(decl.prop)) {
          decl.remove()
        }
      })
    }

    if (isSelectorSet(rule, new Set(['::before', '::after']))) {
      const declarations = rule.nodes?.filter((node): node is postcss.Declaration => node.type === 'decl') ?? []
      if (declarations.length === 1 && declarations[0]?.prop === '--tw-content') {
        rule.remove()
      }
    }
  })
}

function normalizeTailwindV4EmptyVarFallbackSnapshot(source: string) {
  return source.replace(/var\((--tw-[\w-]+),\)/g, 'var($1, )')
}

function getTokenSource(options: CssSnapshotOptions, token: string): CssTokenSource | undefined {
  if (!options.tokenSources) {
    return undefined
  }
  const source = options.tokenSources instanceof Map
    ? options.tokenSources.get(token)
    : options.tokenSources[token]
  if (!source) {
    return undefined
  }
  return Array.isArray(source) ? { token, sources: source } : source
}

function normalizeSelectorTokenCandidate(candidate: string) {
  return candidate
    .replace(/(?<!\\)\\:/g, ':')
    .replace(/(?<!\\)\\\//g, '/')
}

function collectRuleSourceTokens(rule: postcss.Rule, options: CssSnapshotOptions) {
  const tokens = new Map<string, CssTokenSource>()
  for (const selector of rule.selectors) {
    const classMatches = selector.matchAll(/\.((?:\\.|[^\s.#:[{>,])*)/g)
    for (const match of classMatches) {
      const rawCandidate = match[1]
      if (!rawCandidate) {
        continue
      }
      const candidates = [
        normalizeSelectorTokenCandidate(rawCandidate),
        rawCandidate,
      ]
      for (const candidate of candidates) {
        const source = getTokenSource(options, candidate)
        if (!source) {
          continue
        }
        tokens.set(source.token, source)
        break
      }
    }
  }
  return tokens
}

function normalizeTraceCommentBefore(value: string | undefined) {
  if (!value) {
    return ''
  }
  return value.includes('\n') ? value : '\n'
}

function annotateRuleTokenSources(root: postcss.Root, options: CssSnapshotOptions) {
  if (!options.tokenSources) {
    return
  }

  root.walkComments((comment) => {
    if (isCssSourceTraceComment(comment.text)) {
      comment.remove()
    }
  })

  root.walkRules((rule) => {
    const tokens = collectRuleSourceTokens(rule, options)
    if (tokens.size === 0 || !rule.parent) {
      return
    }

    const lines = [...tokens.values()].map(({ token, sources }) => {
      return `${token} <= ${sources.length > 0 ? sources.join(', ') : '<tailwind generated>'}`
    })
    const comment = postcss.comment({ text: `tokens: ${lines.join(' | ')}` })
    comment.raws.before = normalizeTraceCommentBefore(rule.raws.before)
    rule.raws.before = '\n'
    rule.parent.insertBefore(rule, comment)
  })
}

export function normalizeCssSnapshot(source: string, _options: CssSnapshotOptions = {}) {
  const root = postcss.parse(source)

  root.walkComments((comment) => {
    if (/^\$vite\$:\d+$/.test(comment.text.trim())) {
      comment.remove()
    }
  })
  const seenComments = new Set<string>()
  root.walkComments((comment) => {
    const text = comment.text.trim()
    if (!DEDUPED_CSS_SNAPSHOT_COMMENTS.has(text)) {
      return
    }
    if (seenComments.has(text)) {
      comment.remove()
      return
    }
    seenComments.add(text)
  })

  root.walkRules((rule) => {
    rule.selector = rule.selector.replace(/(?<![:\\]):(before|after)\b/g, '::$1')

    if (SCANNER_NOISE_SELECTORS.has(rule.selector)) {
      rule.remove()
      return
    }

    if (/^\.border-_b.+_B$/.test(rule.selector)) {
      rule.walkDecls('border-style', (decl) => {
        if (decl.value === 'var(--tw-border-style)') {
          decl.remove()
        }
      })
    }

    if (/^\.border(?:-[trblxy])?-_b.+_B$/.test(rule.selector)) {
      rule.walkDecls(/^border(?:-.+)?-style$/, (decl) => {
        if (decl.value === 'var(--tw-border-style)') {
          decl.remove()
        }
      })
    }

    const declarations = rule.nodes?.filter(node => node.type === 'decl') ?? []
    for (let index = 0; index < declarations.length - 1; index++) {
      const current = declarations[index]
      const next = declarations[index + 1]
      if (
        current?.type === 'decl'
        && next?.type === 'decl'
        && current.prop === next.prop
        && !current.value.includes('var(')
        && next.value.includes('var(')
      ) {
        current.remove()
      }
    }
  })

  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--') && decl.value.trim().length === 0) {
      decl.value = ''
    }
  })

  normalizeCalcWrapperValues(root)
  dedupeExactDeclarations(root)

  const isTailwindV4 = isTailwindV4Css(root)
  if (!isTailwindV4 && hasWeappEscapedArbitrarySelector(root)) {
    sortUtilityRuleRuns(root)
  }
  normalizeWeappRootRules(root, _options)
  sortSubpackageMarkerChunks(root)
  if (isTailwindV4) {
    removeTailwindV4RootVariableNoise(root, _options)
    removeTailwindV4DefaultTokenNoise(root)
    normalizeTailwindV4ColorOutput(root)
    normalizeTailwindV4DefaultTokenUsage(root)
    sortUtilityRuleRuns(root)
  }
  normalizeNodeSpacing(root)
  annotateRuleTokenSources(root, _options)
  return isTailwindV4
    ? normalizeTailwindV4EmptyVarFallbackSnapshot(root.toString())
    : root.toString()
}

export async function collectCssSnapshots(projectRoot: string, cssRelativePath: string, options: CssSnapshotOptions = {}): Promise<CssSnapshotEntry[]> {
  const rootCssPath = path.resolve(projectRoot, cssRelativePath)
  const visited = new Set<string>()
  const snapshots: CssSnapshotEntry[] = []

  async function visit(targetPath: string, snapshotName: string) {
    const normalizedPath = path.normalize(targetPath)
    if (visited.has(normalizedPath)) {
      return
    }

    if (!(await exists(normalizedPath))) {
      return
    }

    visited.add(normalizedPath)

    const source = normalizeGeneratedCssSourceMarkers(
      await fs.readFile(normalizedPath, 'utf8'),
      options.generatedCssSourceRoot ?? projectRoot,
    )
    const cssNormalizeOptions: CssSnapshotOptions = {}
    if (options.normalizeWebpackAppSplitNoise) {
      cssNormalizeOptions.normalizeWebpackAppSplitNoise = true
    }
    if (options.normalizeTailwindV4RootVariableNoise) {
      cssNormalizeOptions.normalizeTailwindV4RootVariableNoise = true
    }
    const formatted = await formatRawCssSnapshotText(source, cssNormalizeOptions)

    snapshots.push({
      fileName: snapshotName,
      content: formatted,
    })

    const imports = extractCssImports(source)
    for (const request of imports) {
      const resolved = resolveCssImport(projectRoot, normalizedPath, request)
      if (!resolved) {
        continue
      }
      const nextSnapshotName = computeSnapshotName(projectRoot, normalizedPath, resolved)
      if (!nextSnapshotName) {
        continue
      }
      await visit(resolved, nextSnapshotName)
    }
  }

  const rootSnapshotName = options.rootSnapshotName ?? path.basename(cssRelativePath)
  await visit(rootCssPath, normalizeSnapshotName(rootSnapshotName) ?? rootSnapshotName)
  return snapshots
}
