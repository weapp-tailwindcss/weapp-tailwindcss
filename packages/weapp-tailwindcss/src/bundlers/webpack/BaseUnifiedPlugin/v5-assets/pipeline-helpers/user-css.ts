import path from 'node:path'
import { hasAdditionalWebpackAssetUserCssMarkers, hasWebpackTailwindSourceDirectives } from './generated-css'

export { isWebpackCssSourceRepresentedInAsset, isWebpackTailwindImportRequest, normalizeWebpackUserCssFallbackSource, removeWebpackGeneratorNonTailwindImports, removeWebpackUserCssFallbackImports } from '@weapp-tailwindcss/postcss/transform'

export function createWebpackGeneratorCssSource(
  file: string | undefined,
  css: string | undefined,
) {
  if (!file || !css || !hasWebpackTailwindSourceDirectives(css)) {
    return undefined
  }
  return {
    file,
    base: path.dirname(file),
    css,
    dependencies: [file],
  }
}

export function createWebpackUserCssSourceAppend(
  sources: Iterable<{ css: string | undefined, file: string, processed?: boolean | undefined }>,
  generatorRawSource: string,
  currentSourceFile?: string | undefined,
  shouldIncludeSource?: ((file: string) => boolean) | undefined,
) {
  const matchedSources: Array<{ css: string, file: string, processed: boolean }> = []
  const seen = new Set<string>()
  for (const source of sources) {
    const css = source.css
    if (!css || seen.has(css)) {
      continue
    }
    if (shouldIncludeSource && !shouldIncludeSource(source.file)) {
      continue
    }
    seen.add(css)
    if (
      (source.processed === true || !css.includes('data:'))
      && hasAdditionalWebpackAssetUserCssMarkers(css, generatorRawSource)
    ) {
      matchedSources.push({
        css,
        file: source.file,
        processed: source.processed === true,
      })
    }
  }
  const currentFile = currentSourceFile ? path.resolve(currentSourceFile) : undefined
  const parts = matchedSources
    .sort((a, b) => {
      const aCurrent = currentFile !== undefined && path.resolve(a.file) === currentFile
      const bCurrent = currentFile !== undefined && path.resolve(b.file) === currentFile
      if (aCurrent !== bCurrent) {
        return aCurrent ? -1 : 1
      }
      return a.file.localeCompare(b.file)
    })
    .map(source => source.css)
  return parts.length > 0
    ? {
        css: parts.join('\n'),
        processed: matchedSources.every(source => source.processed),
      }
    : undefined
}

export { composeProcessedCssSources as createWebpackGeneratorUserCssSourceAppend } from '@weapp-tailwindcss/postcss/transform'
