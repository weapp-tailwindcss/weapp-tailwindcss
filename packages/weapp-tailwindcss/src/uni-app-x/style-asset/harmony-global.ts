import type { UniAppXLocalStyleMatcher } from '../local-style-matcher'
import type { StyleValue } from './style-value'
import {
  normalizeUniAppXLocalStyleId,
  shouldEnableComponentLocalStyle,
} from '../local-style-matcher'
import {
  createMergedStyleValue,
  createMergedStyleValues,
  createStyleValueFromApplySources,
  cssSourceToStyleValue,
  mergeStyleValues,
  parseSourceMapSourcesContent,
  parseStyleObject,
} from './style-value'

const UVUE_TS_RE = /\.uvue\.ts$/
const JS_RE = /\.js$/
const APP_JS_RE = /(?:^|\/)App\.js$/
const COMPONENT_JS_RE = /(?:^|\/)components\/.+\.js$/
const STYLE_DECL_RE = /const\s+(_style_\d+)\s*=\s*\{/g
const EXPORT_SFC_RE = /_export_sfc\(_sfc_main\s*,\s*\[/

export interface HarmonyStyleInjectOptions {
  componentMatcher?: UniAppXLocalStyleMatcher | undefined
  cssSources?: Iterable<string | undefined> | undefined
  styleAssetFiles?: Iterable<string | undefined> | ((file: string) => Iterable<string | undefined>) | undefined
  excludeComponents?: boolean | undefined
  mapSources?: Iterable<string | undefined> | undefined
}

function resolveSfcSourceId(code: string) {
  const match = code.match(/\[\s*["']__file["']\s*,\s*(["'])(.*?)\1\s*\]/)
  return match?.[2] ? normalizeUniAppXLocalStyleId(match[2]) : undefined
}

function shouldExcludeComponent(file: string, code: string, options: HarmonyStyleInjectOptions) {
  if (!options.excludeComponents) {
    return false
  }
  const sourceId = resolveSfcSourceId(code)
  if (sourceId) {
    return shouldEnableComponentLocalStyle(sourceId, options.componentMatcher)
  }
  const normalizedFile = normalizeUniAppXLocalStyleId(file)
  if (options.componentMatcher?.(normalizedFile)) {
    return true
  }
  return COMPONENT_JS_RE.test(normalizedFile)
}

interface StyleObjectDecl {
  end: number
  objectEnd: number
  objectStart: number
  objectText: string
  start: number
  varName: string
}

export function resolveStyleAssetFile(file: string) {
  if (!UVUE_TS_RE.test(file)) {
    return
  }
  return file.replace(/\.uvue\.ts$/, '.uvue')
}

export function resolveStylePlaceholderFallbackFiles(file: string) {
  const styleAssetFile = resolveStyleAssetFile(file)
  if (!styleAssetFile) {
    return []
  }
  const base = styleAssetFile.replace(/\.uvue$/, '')
  return [
    styleAssetFile,
    `${base}.wxss`,
    `${base}.css`,
  ]
}

function findBalancedObjectEnd(source: string, start: number) {
  let depth = 0
  let quote: string | undefined
  let escaped = false
  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      }
      else if (char === '\\') {
        escaped = true
      }
      else if (char === quote) {
        quote = undefined
      }
      continue
    }
    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') {
      depth++
      continue
    }
    if (char === '}') {
      depth--
      if (depth === 0) {
        return index + 1
      }
    }
  }
}

function findStyleObjectDecls(source: string) {
  STYLE_DECL_RE.lastIndex = 0
  const declarations: StyleObjectDecl[] = []
  for (const match of source.matchAll(STYLE_DECL_RE)) {
    const varName = match[1]
    if (!varName || match.index === undefined) {
      continue
    }
    const objectStart = source.indexOf('{', match.index)
    if (objectStart < 0) {
      continue
    }
    const objectEnd = findBalancedObjectEnd(source, objectStart)
    if (!objectEnd) {
      continue
    }
    const semicolonEnd = source[objectEnd] === ';' ? objectEnd + 1 : objectEnd
    declarations.push({
      end: semicolonEnd,
      objectEnd,
      objectStart,
      objectText: source.slice(objectStart, objectEnd),
      start: match.index,
      varName,
    })
  }
  return declarations
}

function resolveCssFallbackFiles(styleAssetFiles: Iterable<string | undefined> = []) {
  const files = new Set<string>()
  for (const assetFile of styleAssetFiles) {
    if (assetFile) {
      files.add(assetFile)
    }
  }
  return [...files]
}

function resolveStyleAssetFilesForChunk(file: string, styleAssetFiles: HarmonyStyleInjectOptions['styleAssetFiles']) {
  return typeof styleAssetFiles === 'function'
    ? styleAssetFiles(file)
    : styleAssetFiles
}

function resolveSourceMapFiles(file: string) {
  return [
    `${file}.map`,
    file.startsWith('assets/') ? `${file.slice('assets/'.length)}.map` : undefined,
    file.startsWith('assets/') ? undefined : `assets/${file}.map`,
  ].filter((item): item is string => typeof item === 'string')
}

function createStyleValueFromBundleSources(
  file: string,
  getBundleSource?: (file: string) => string | undefined,
  options: HarmonyStyleInjectOptions = {},
) {
  const cssStyles = mergeStyleValues(
    ...[...(options.cssSources ?? [])].map(source => source ? cssSourceToStyleValue(source) : undefined),
    ...resolveCssFallbackFiles(resolveStyleAssetFilesForChunk(file, options.styleAssetFiles)).map((cssFile) => {
      const source = getBundleSource?.(cssFile)
      return source ? cssSourceToStyleValue(source) : undefined
    }),
  )
  const mapSources = [
    ...(options.mapSources ?? []),
    ...resolveSourceMapFiles(file).flatMap((mapFile) => {
      const source = getBundleSource?.(mapFile)
      return source ? parseSourceMapSourcesContent(source) : []
    }),
  ].filter((source): source is string => typeof source === 'string')
  return mergeStyleValues(cssStyles, createStyleValueFromApplySources(mapSources, cssStyles))
}

function injectStyleOption(code: string, styleVarName: string) {
  const styleOptionMatch = code.match(/(\["styles"\s*,\s*\[)([^\]]*)(\]\])/)
  if (styleOptionMatch?.index !== undefined) {
    const styleVars = styleOptionMatch[2]?.trim()
    if (styleVars?.split(',').map(item => item.trim()).includes(styleVarName)) {
      return code
    }
    const replacement = `${styleOptionMatch[1]}${styleVars ? `${styleVars}, ` : ''}${styleVarName}${styleOptionMatch[3]}`
    return `${code.slice(0, styleOptionMatch.index)}${replacement}${code.slice(styleOptionMatch.index + styleOptionMatch[0].length)}`
  }
  const exportMatch = code.match(EXPORT_SFC_RE)
  if (!exportMatch || exportMatch.index === undefined) {
    return code
  }
  const fileOptionIndex = code.indexOf('["__file"', exportMatch.index)
  if (fileOptionIndex < 0) {
    return code
  }
  return `${code.slice(0, fileOptionIndex)}["styles", [${styleVarName}]], ${code.slice(fileOptionIndex)}`
}

export function injectUniAppXHarmonyGlobalStyles(
  file: string,
  code: string,
  getBundleSource?: (file: string) => string | undefined,
  options: HarmonyStyleInjectOptions = {},
) {
  if (!JS_RE.test(file) || APP_JS_RE.test(file)) {
    return code
  }
  if (shouldExcludeComponent(file, code, options)) {
    return code
  }
  const appSource = getBundleSource?.('assets/App.js') ?? getBundleSource?.('App.js')
  const appStyle = appSource
    ? mergeStyleValues(...findStyleObjectDecls(appSource).map(decl => parseStyleObject(decl.objectText)))
    : undefined
  const localStyleDecls = findStyleObjectDecls(code)
  const parseableLocalStyles = localStyleDecls.flatMap((decl) => {
    const style = parseStyleObject(decl.objectText)
    return style ? [{ decl, style }] : []
  })
  const bundleStyle = createStyleValueFromBundleSources(file, getBundleSource, options)
  const styleSource = mergeStyleValues(bundleStyle, appStyle)
  if (!styleSource) {
    return code
  }
  const mergedStyles = createMergedStyleValues(
    code,
    parseableLocalStyles.map(item => item.style),
    styleSource as StyleValue,
  )
  if (mergedStyles) {
    let nextCode = code
    for (let index = parseableLocalStyles.length - 1; index >= 0; index--) {
      const decl = parseableLocalStyles[index]!.decl
      nextCode = `${nextCode.slice(0, decl.objectStart)}${JSON.stringify(mergedStyles[index])}${nextCode.slice(decl.objectEnd)}`
    }
    return nextCode
  }
  if (parseableLocalStyles.length > 0) {
    return code
  }
  const newStyle = createMergedStyleValue(code, undefined, styleSource as StyleValue)
  if (!newStyle) {
    return code
  }
  const exportMatch = code.match(EXPORT_SFC_RE)
  if (!exportMatch || exportMatch.index === undefined) {
    return code
  }
  const styleVarName = '_style_wt'
  const statementStart = code.lastIndexOf('\n', exportMatch.index)
  const insertPos = statementStart === -1 ? 0 : statementStart + 1
  const declarationRE = new RegExp(`\\b(?:const|let|var)\\s+${styleVarName}\\s*=`)
  const withStyleDecl = declarationRE.test(code)
    ? code
    : `${code.slice(0, insertPos)}const ${styleVarName} = ${JSON.stringify(newStyle)};\n${code.slice(insertPos)}`
  return injectStyleOption(withStyleDecl, styleVarName)
}
