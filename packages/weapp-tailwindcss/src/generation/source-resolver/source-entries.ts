import type { GeneratorSourceRecord } from './metadata'
import type { GeneratorSourceRuntimeState } from './types'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { resolveTailwindV4EntriesFromCss } from '@/project-sources/index'
import { tryResolveTailwindV4SourceOptions } from './configuration'

export async function resolveGeneratorSourceEntries(record: GeneratorSourceRecord, runtimeState?: GeneratorSourceRuntimeState) {
  const { metadata: sourceMetadata, source } = record
  if (sourceMetadata?.sourceEntries) {
    return sourceMetadata.sourceEntries
  }
  if (!('css' in source) || !('base' in source) || !('baseFallbacks' in source)) {
    return undefined
  }
  const resolved = await resolveTailwindV4EntriesFromCss(
    sourceMetadata?.sourceCss ?? source.css,
    sourceMetadata?.sourceBase ?? source.base,
  )
  if (
    resolved?.entries.length === 0
    && !resolved.inlineCandidates.included.size
    && !resolved.inlineCandidates.excluded.size
    && !resolved.dependencies.length
  ) {
    if (sourceMetadata?.matchedCssSourceFile) {
      return []
    }
    return undefined
  }
  if (resolved?.entries.length || (!resolved?.explicit && !sourceMetadata?.matchedCssSourceFile) || !runtimeState) {
    return resolved?.entries
  }
  const sourceOptions = tryResolveTailwindV4SourceOptions(runtimeState)
  const matchingCssSource = sourceOptions?.cssSources?.find((cssSource) => {
    if (
      sourceMetadata?.matchedCssSourceFile
      && typeof cssSource.file === 'string'
      && path.resolve(cssSource.file) === path.resolve(sourceMetadata.matchedCssSourceFile)
    ) {
      return true
    }
    return cssSource.css === source.css
  })
  if (!matchingCssSource) {
    return resolved?.entries
  }
  const sourceResolved = await resolveTailwindV4EntriesFromCss(
    matchingCssSource.css,
    typeof matchingCssSource.base === 'string' && matchingCssSource.base.length > 0
      ? matchingCssSource.base
      : typeof matchingCssSource.file === 'string' && matchingCssSource.file.length > 0
        ? path.dirname(matchingCssSource.file)
        : source.base,
  )
  if (sourceResolved?.entries.length) {
    return sourceResolved.entries
  }
  for (const dependency of matchingCssSource.dependencies ?? []) {
    if (!existsSync(dependency)) {
      continue
    }
    try {
      const dependencyResolved = await resolveTailwindV4EntriesFromCss(
        readFileSync(dependency, 'utf8'),
        path.dirname(dependency),
      )
      if (dependencyResolved?.entries.length) {
        return dependencyResolved.entries
      }
    }
    catch {
      // 依赖内容只用于裁剪候选，读取失败时回退到 Tailwind 自身生成逻辑。
    }
  }
  return resolved?.entries
}
