import type { OutputChunk, SourceMap } from 'rollup'
import { splitCandidateTokens } from '@weapp-tailwindcss/engine'
import {
  collectCssApplyUtilities,
  cssToClassStyleValue,
  expandCssApplySourcesToStyleValue,
  normalizeUniAppXStyleProperty,
  normalizeUniAppXStyleValue,
  rewriteUniAppXStyleReferences,
} from '@weapp-tailwindcss/postcss/transform'
import { resolveStyleReferencePath } from '../style-reference-path'

const GEN_APP_STYLES_RE = /const\s+GenAppStyles\s*=\s*\[_uM\(\[([\s\S]*?)\]\)\]/
const STYLE_ENTRY_RE = /\[\s*("((?:\\.|[^"\\])+)")\s*,\s*(_pS\(_uM\(\[[\s\S]*?\]\)\))\s*\]/g
const STRING_LITERAL_RE = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g
const SFC_STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
const STYLE_EXPORT_PREFIX_RE = /^\s*export\s+default\s+/

type StyleDeclarations = Record<string, string | number>
export type StyleValue = Record<string, Record<string, StyleDeclarations>>

function cloneStyleEntry(entry: Record<string, StyleDeclarations>): Record<string, StyleDeclarations> {
  return Object.fromEntries(
    Object.entries(entry).map(([state, declarations]) => [state, { ...declarations }]),
  )
}

function mergeStyleEntry(
  local: Record<string, StyleDeclarations> | undefined,
  generated: Record<string, StyleDeclarations>,
) {
  const merged = local ? cloneStyleEntry(local) : {}
  for (const [state, declarations] of Object.entries(generated)) {
    merged[state] = {
      ...(merged[state] ?? {}),
      ...declarations,
    }
  }
  return merged
}

function cloneStyleValue(style: StyleValue): StyleValue {
  return Object.fromEntries(
    Object.entries(style).map(([className, entry]) => [className, cloneStyleEntry(entry)]),
  )
}

export function parseStyleExport(source: string): StyleValue | undefined {
  const json = source.replace(STYLE_EXPORT_PREFIX_RE, '').trim()
  if (!json) {
    return
  }
  try {
    return JSON.parse(json) as StyleValue
  }
  catch {

  }
}

export function parseStyleObject(source: string): StyleValue | undefined {
  try {
    return JSON.parse(source) as StyleValue
  }
  catch {

  }
}

export function parseSourceMapSourcesContent(source: string) {
  try {
    const map = JSON.parse(source) as { sourcesContent?: unknown }
    return Array.isArray(map.sourcesContent)
      ? map.sourcesContent.filter((item): item is string => typeof item === 'string')
      : []
  }
  catch {
    return []
  }
}

export function collectChunkMapSourcesContent(chunk: OutputChunk) {
  const map = chunk.map as SourceMap | null | undefined
  return Array.isArray(map?.sourcesContent)
    ? map.sourcesContent.filter((item): item is string => typeof item === 'string')
    : []
}

export function styleExportToUtsMap(styleExport: StyleValue) {
  const classEntries: string[] = []
  for (const [className, styleStates] of Object.entries(styleExport)) {
    const declarations = styleStates['']
    if (!declarations || Object.keys(declarations).length === 0) {
      continue
    }
    const declarationEntries = Object.entries(declarations).map(([prop, value]) => {
      return `[${JSON.stringify(normalizeUniAppXStyleProperty(prop))}, ${JSON.stringify(normalizeUniAppXStyleValue(prop, value))}]`
    })
    if (declarationEntries.length === 0) {
      continue
    }
    classEntries.push(`[${JSON.stringify(className)}, _pS(_uM([${declarationEntries.join(', ')}]))]`)
  }
  if (classEntries.length === 0) {
    return '[]'
  }
  return `[_uM([${classEntries.join(', ')}])]`
}

function createUtsStyleArray(entries: string[]) {
  if (entries.length === 0) {
    return '[]'
  }
  return `[_uM([${entries.join(', ')}])]`
}

function extractAppStyleEntries(source: string) {
  const match = source.match(GEN_APP_STYLES_RE)
  if (!match?.[1]) {
    return
  }
  const entries = new Map<string, string>()
  for (const entry of match[1].matchAll(STYLE_ENTRY_RE)) {
    const rawClassName = entry[1]
    const className = entry[2]
    const styleValue = entry[3]
    if (!rawClassName || !className || !styleValue) {
      continue
    }
    entries.set(JSON.parse(rawClassName) as string, `[${rawClassName}, ${styleValue}]`)
  }
  return entries.size > 0 ? entries : undefined
}

function collectUsedClassNames(code: string, entries: Map<string, string>) {
  const used = new Set<string>()
  for (const literalMatch of code.matchAll(STRING_LITERAL_RE)) {
    const literal = literalMatch[2]
    if (!literal) {
      continue
    }
    for (const candidate of splitCandidateTokens(literal)) {
      if (entries.has(candidate)) {
        used.add(candidate)
      }
    }
  }
  return used
}

function collectUsedStyleKeys(code: string, styleValue: StyleValue) {
  const entries = new Map(Object.keys(styleValue).map(className => [className, className]))
  return collectUsedClassNames(code, entries)
}

export function createUtsStyleArrayFromAppStyles(code: string, appSource?: string) {
  if (!appSource) {
    return
  }
  const entries = extractAppStyleEntries(appSource)
  if (!entries) {
    return
  }
  const used = collectUsedClassNames(code, entries)
  if (used.size === 0) {
    return
  }
  return createUtsStyleArray([...used].map(className => entries.get(className)!).filter(Boolean))
}

export function cssSourceToStyleValue(source: string) {
  return STYLE_EXPORT_PREFIX_RE.test(source)
    ? parseStyleExport(source)
    : cssToClassStyleValue(source)
}

export function mergeStyleValues(...items: Array<StyleValue | undefined>) {
  const result: StyleValue = {}
  for (const item of items) {
    if (!item) {
      continue
    }
    for (const [className, states] of Object.entries(item)) {
      if (!result[className]) {
        result[className] = states
      }
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

export function createStyleValueFromApplySources(sources: string[], utilityStyles: StyleValue | undefined) {
  if (!utilityStyles) {
    return
  }
  const result: StyleValue = {}
  for (const source of sources) {
    const styleSources = source.includes('<style')
      ? [...source.matchAll(SFC_STYLE_BLOCK_RE)].map(styleBlock => styleBlock[1] ?? '')
      : [source]
    for (const styleSource of styleSources) {
      const applied = expandCssApplySourcesToStyleValue(styleSource, utilityStyles)
      if (!applied) {
        continue
      }
      Object.assign(result, applied)
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function resolveReferencePaths(styleSource: string, sourceId?: string) {
  const cleanSourceId = sourceId?.replace(/\?.*$/, '')
  return rewriteUniAppXStyleReferences(styleSource, sourceId
    ? reference => resolveStyleReferencePath(cleanSourceId!, reference)
    : undefined)
}

export function collectUniAppXHarmonyApplyStyleSourcesFromSource(source: string, sourceId?: string) {
  const styleSources = source.includes('<style')
    ? [...source.matchAll(SFC_STYLE_BLOCK_RE)].map(styleBlock => styleBlock[1] ?? '')
    : [source]
  return styleSources
    .map(styleSource => resolveReferencePaths(styleSource.trim(), sourceId))
    .filter(styleSource => styleSource.length > 0 && styleSource.includes('@apply'))
}

export function collectUniAppXHarmonyApplyUtilitiesFromSources(sources: Iterable<string>) {
  const utilities = new Set<string>()
  for (const source of sources) {
    for (const styleSource of collectUniAppXHarmonyApplyStyleSourcesFromSource(source)) {
      for (const utility of collectCssApplyUtilities(styleSource)) {
        utilities.add(utility)
      }
    }
  }
  return utilities
}

export function createMergedStyleValue(code: string, localStyle: StyleValue | undefined, appStyle: StyleValue) {
  const used = collectUsedStyleKeys(code, appStyle)
  if (used.size === 0) {
    return
  }
  const merged = localStyle ? cloneStyleValue(localStyle) : {}
  let changed = false
  for (const className of used) {
    const generatedStyle = appStyle[className]
    if (!generatedStyle) {
      continue
    }
    const next = mergeStyleEntry(merged[className], generatedStyle)
    if (JSON.stringify(next) === JSON.stringify(merged[className])) {
      continue
    }
    merged[className] = next
    changed = true
  }
  return changed ? merged : undefined
}

export function createMergedStyleValues(code: string, localStyles: StyleValue[], appStyle: StyleValue) {
  if (localStyles.length === 0) {
    return
  }
  const used = collectUsedStyleKeys(code, appStyle)
  if (used.size === 0) {
    return
  }
  const merged = localStyles.map(cloneStyleValue)
  let changed = false
  for (const className of used) {
    const generatedStyle = appStyle[className]
    if (!generatedStyle) {
      continue
    }
    const indexes = merged.flatMap((style, index) => style[className] ? [index] : [])
    if (indexes.length === 0) {
      merged[0]![className] = mergeStyleEntry(undefined, generatedStyle)
      changed = true
      continue
    }
    for (const index of indexes) {
      const next = mergeStyleEntry(merged[index]![className], generatedStyle)
      if (JSON.stringify(merged[index]![className]) === JSON.stringify(next)) {
        continue
      }
      merged[index]![className] = next
      changed = true
    }
  }
  return changed ? merged : undefined
}
