import type { OutputAsset, OutputChunk } from 'rollup'
import type { HarmonyStyleInjectOptions } from './style-asset/harmony-global'
import { createUniAppXHarmonyApplyGeneratorSource as createHarmonyApplyGeneratorSource } from '@weapp-tailwindcss/postcss/transform'
import { expandUniAppXHarmonyApplyStyles } from './style-asset/harmony-apply'
import {
  injectUniAppXHarmonyGlobalStyles,
  resolveStyleAssetFile,
  resolveStylePlaceholderFallbackFiles,
} from './style-asset/harmony-global'
import {
  collectChunkMapSourcesContent,
  collectUniAppXHarmonyApplyStyleSourcesFromSource,
  collectUniAppXHarmonyApplyUtilitiesFromSources,
  createUtsStyleArrayFromAppStyles,
  cssSourceToStyleValue,
  mergeStyleValues,
  parseSourceMapSourcesContent,
  styleExportToUtsMap,
} from './style-asset/style-value'

const GEN_STYLES_PLACEHOLDER_RE = /\/\*(Gen[A-Za-z0-9]+Styles)\*\/|const\s+(Gen[A-Za-z0-9]+Styles)\s*=\s*\[\]/
const APP_JS_RE = /(?:^|\/)App\.js$/
const HARMONY_BUNDLE_MARKER_FILES = new Set([
  'import/app-service.ets',
  'import/dynamic.ets',
  'uni_modules/oh-package.json5',
])

function resolveSourceMapFiles(file: string) {
  return [
    `${file}.map`,
    file.startsWith('assets/') ? `${file.slice('assets/'.length)}.map` : undefined,
    file.startsWith('assets/') ? undefined : `assets/${file}.map`,
  ].filter((item): item is string => typeof item === 'string')
}

export const UNI_APP_X_STYLE_PLACEHOLDER_VERSION = 'uni-app-x-style-placeholder-v3'

type BundleItem = { type: string } | OutputAsset | OutputChunk
type OutputChunkWithViteMetadata = OutputChunk & {
  viteMetadata?: {
    importedCss?: Iterable<string>
  }
}

export {
  collectUniAppXHarmonyApplyStyleSourcesFromSource,
  collectUniAppXHarmonyApplyUtilitiesFromSources,
  expandUniAppXHarmonyApplyStyles,
  injectUniAppXHarmonyGlobalStyles,
}

export function createUniAppXHarmonyApplyGeneratorSource(
  applyStyleSources: string[],
  _applyUtilities: Iterable<string>,
) {
  return createHarmonyApplyGeneratorSource(applyStyleSources)
}

export function collectUniAppXHarmonyApplyUtilities(bundle: Record<string, BundleItem>) {
  const utilities = new Set<string>()
  const getBundleSource = createUniAppXBundleAssetSourceGetter(bundle)
  for (const [file, item] of Object.entries(bundle)) {
    if (item.type !== 'chunk' || !file.endsWith('.js') || APP_JS_RE.test(file)) {
      continue
    }
    const mapSources = collectChunkMapSourcesContent(item as OutputChunk).concat(
      resolveSourceMapFiles(file).flatMap((mapFile) => {
        const source = getBundleSource(mapFile)
        return source ? parseSourceMapSourcesContent(source) : []
      }),
    )
    for (const source of mapSources) {
      for (const utility of collectUniAppXHarmonyApplyUtilitiesFromSources([source])) {
        utilities.add(utility)
      }
    }
  }
  return utilities
}

export function collectUniAppXHarmonyApplyStyleSources(bundle: Record<string, BundleItem>) {
  const sources = new Set<string>()
  const getBundleSource = createUniAppXBundleAssetSourceGetter(bundle)
  const addSource = (source: string) => {
    for (const styleSource of collectUniAppXHarmonyApplyStyleSourcesFromSource(source)) {
      sources.add(styleSource)
    }
  }
  for (const [file, item] of Object.entries(bundle)) {
    if (item.type === 'asset' && file.endsWith('.uvue')) {
      addSource(String((item as OutputAsset).source))
      continue
    }
    if (item.type !== 'chunk' || !file.endsWith('.js') || APP_JS_RE.test(file)) {
      continue
    }
    for (const sourceContent of collectChunkMapSourcesContent(item as OutputChunk)) {
      addSource(sourceContent)
    }
    for (const mapFile of resolveSourceMapFiles(file)) {
      const source = getBundleSource(mapFile)
      if (!source) {
        continue
      }
      for (const sourceContent of parseSourceMapSourcesContent(source)) {
        addSource(sourceContent)
      }
    }
  }
  return [...sources]
}

export function injectUniAppXStylePlaceholder(
  file: string,
  code: string,
  getAssetSource?: (file: string) => string | undefined,
  cssSources: Iterable<string | undefined> = [],
) {
  const match = code.match(GEN_STYLES_PLACEHOLDER_RE)
  const stylesName = match?.[1] ?? match?.[2]
  if (!stylesName) {
    return code
  }
  const styleAssetFile = resolveStyleAssetFile(file)
  if (!styleAssetFile) {
    return code
  }
  const appStyleArray = createUtsStyleArrayFromAppStyles(code, getAssetSource?.('App.uvue.ts'))
  const fallbackStyleSources = resolveStylePlaceholderFallbackFiles(file)
    .map(candidate => getAssetSource?.(candidate))
  const styleExport = mergeStyleValues(
    ...[...cssSources, ...fallbackStyleSources]
      .map(source => source ? cssSourceToStyleValue(source) : undefined),
  )
  const cssStyleArray = styleExport ? styleExportToUtsMap(styleExport) : undefined
  const styleArrays = [appStyleArray, cssStyleArray].filter((item): item is string => Boolean(item))
  if (styleArrays.length === 0) {
    return code
  }
  const mergedStyleArray = styleArrays.length === 1
    ? styleArrays[0]
    : `[${styleArrays.map(item => item.slice(1, -1)).filter(Boolean).join(', ')}]`
  return code.replace(GEN_STYLES_PLACEHOLDER_RE, `const ${stylesName} = ${mergedStyleArray}`)
}

export function injectUniAppXHarmonyBundleStyles(
  bundle: Record<string, BundleItem>,
  options: HarmonyStyleInjectOptions = {},
) {
  const getBundleSource = createUniAppXBundleAssetSourceGetter(bundle)
  const styleAssetFilesByChunk = collectUniAppXBundleStyleAssetFilesByChunk(bundle)
  const resolveStyleAssetFiles = typeof options.styleAssetFiles === 'function'
    ? options.styleAssetFiles
    : (file: string) => [
        ...((options.styleAssetFiles as Iterable<string | undefined> | undefined) ?? []),
        ...(styleAssetFilesByChunk.get(file) ?? []),
      ]
  let changed = false
  for (const [file, item] of Object.entries(bundle)) {
    if (item.type !== 'chunk' || !file.endsWith('.js')) {
      continue
    }
    const currentSource = (item as OutputChunk).code
    const nextSource = injectUniAppXHarmonyGlobalStyles(file, currentSource, getBundleSource, {
      ...options,
      styleAssetFiles: resolveStyleAssetFiles,
      mapSources: collectChunkMapSourcesContent(item as OutputChunk),
    })
    if (nextSource !== currentSource) {
      ;(item as OutputChunk).code = nextSource
      changed = true
    }
  }
  return changed
}

function collectUniAppXBundleStyleAssetFilesByChunk(bundle: Record<string, BundleItem>) {
  const styleAssetFilesByChunk = new Map<string, Set<string>>()
  const appStyleAssetFiles = new Set<string>()
  const assetFiles = new Set(
    Object.entries(bundle)
      .filter(([, item]) => item.type === 'asset')
      .map(([file]) => file)
      .filter(isStyleAssetFile),
  )

  for (const [chunkFile, item] of Object.entries(bundle)) {
    if (item.type !== 'chunk') {
      continue
    }
    const chunk = item as OutputChunkWithViteMetadata
    for (const cssFile of chunk.viteMetadata?.importedCss ?? []) {
      if (!assetFiles.has(cssFile)) {
        continue
      }
      if (APP_JS_RE.test(chunk.fileName ?? chunkFile) || APP_JS_RE.test(chunkFile)) {
        appStyleAssetFiles.add(cssFile)
        continue
      }
      let styleAssetFiles = styleAssetFilesByChunk.get(chunkFile)
      if (!styleAssetFiles) {
        styleAssetFiles = new Set<string>()
        styleAssetFilesByChunk.set(chunkFile, styleAssetFiles)
      }
      styleAssetFiles.add(cssFile)
    }
  }

  if (appStyleAssetFiles.size > 0) {
    for (const [file, item] of Object.entries(bundle)) {
      if (item.type !== 'chunk' || !file.endsWith('.js') || APP_JS_RE.test(file)) {
        continue
      }
      let styleAssetFiles = styleAssetFilesByChunk.get(file)
      if (!styleAssetFiles) {
        styleAssetFiles = new Set<string>()
        styleAssetFilesByChunk.set(file, styleAssetFiles)
      }
      for (const appStyleAssetFile of appStyleAssetFiles) {
        styleAssetFiles.add(appStyleAssetFile)
      }
    }
  }

  return styleAssetFilesByChunk
}

function isStyleAssetFile(file: string) {
  return /\.(?:acss|css|jxss|qss|ttss|wxss)$/i.test(file)
}

export function isUniAppXHarmonyBundle(bundle: Record<string, BundleItem>) {
  for (const file of Object.keys(bundle)) {
    if (HARMONY_BUNDLE_MARKER_FILES.has(file)) {
      return true
    }
  }
  return false
}

export function createUniAppXBundleAssetSourceGetter(bundle: Record<string, BundleItem>) {
  return (file: string) => {
    const item = bundle[file] ?? Object.entries(bundle).find(([key, value]) => {
      if (value.type !== 'asset' && value.type !== 'chunk') {
        return false
      }
      const outputFile = (value as OutputAsset | OutputChunk).fileName || key
      return key === file
        || key.endsWith(`/${file}`)
        || outputFile === file
        || outputFile.endsWith(`/${file}`)
    })?.[1]
    if (!item) {
      return
    }
    if (item.type === 'asset') {
      return String((item as OutputAsset).source)
    }
    if (item.type === 'chunk') {
      return String((item as OutputChunk).code)
    }
  }
}
