import type { OutputAsset } from 'rollup'
import type { RememberedCssSource } from './types'
import type { InternalUserDefinedOptions } from '@/types'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { CSS_SOURCE_OUTPUT_EXT_RE, resolveViteCssPipelineOutputFileFromSourceFile } from '../css-output'
import { getActiveViteSourceOutputRelationOwner } from '../source-output-relations'

export function createRememberedCssRuntimeSignature(cssRuntimeSignature: string, cssRuntimeAffectingHash: string) {
  return `${cssRuntimeSignature}:${cssRuntimeAffectingHash}`
}

/** 入口重放的干净生成结果，避免和已合并框架贡献的产物缓存混用。 */
export function createGeneratedReplayCacheKey(outputFile: string) {
  return `${normalizeOutputPathKey(outputFile)}::__generated_replay__`
}

export function resolveRememberedCssSourceForTest(
  sources: Iterable<[string, RememberedCssSource]> | undefined,
  outputFile: string,
  file: string,
  originalSource: OutputAsset,
  outputRoot: string,
  sourceRoot: string | undefined,
) {
  return findRememberedCssSource(sources, outputFile, file, originalSource, outputRoot, sourceRoot)
}

function findRememberedCssSource(
  sources: Iterable<[string, RememberedCssSource]> | undefined,
  outputFile: string,
  file: string,
  originalSource: OutputAsset,
  outputRoot: string,
  sourceRoot: string | undefined,
) {
  const matched = findRememberedCssSources(sources, outputFile, file, originalSource, outputRoot, sourceRoot)
  return matched.length === 1 ? matched[0] : undefined
}

function normalizeRememberedSourceIdentity(file: string) {
  return normalizeOutputPathKey(file.replace(/[?#].*$/, ''))
}

export function findRememberedCssSources(
  sources: Iterable<[string, RememberedCssSource]> | undefined,
  outputFile: string,
  file: string,
  originalSource: OutputAsset,
  outputRoot: string,
  sourceRoot: string | undefined,
) {
  void outputRoot
  void sourceRoot
  if (!sources) {
    return []
  }
  const rememberedSources = [...sources].map(([, remembered]) => remembered)
  const originalFiles = [
    file,
    originalSource.fileName,
    originalSource.originalFileName,
    ...(originalSource.originalFileNames ?? []),
  ].filter((item): item is string => typeof item === 'string' && item.length > 0)

  const sourceMatched = rememberedSources.filter(remembered =>
    originalFiles.some(originalFile => normalizeRememberedSourceIdentity(remembered.sourceFile) === normalizeRememberedSourceIdentity(originalFile)),
  )
  if (sourceMatched.length > 0) {
    return sourceMatched
  }

  const outputMatched = rememberedSources.filter(remembered =>
    normalizeOutputPathKey(remembered.outputFile) === normalizeOutputPathKey(outputFile),
  )
  if (outputMatched.length > 0) {
    return outputMatched
  }
  const relationOwner = getActiveViteSourceOutputRelationOwner()
  if (!relationOwner) {
    return []
  }
  const outputKeys = new Set([outputFile, file].map(normalizeOutputPathKey))
  return rememberedSources.filter(remembered =>
    [...relationOwner.getOwnedOutputs(remembered.sourceFile)].some(ownedOutput =>
      outputKeys.has(normalizeOutputPathKey(ownedOutput)),
    ),
  )
}

export function mergeRememberedCssSources(
  sources: RememberedCssSource[],
  outputFile: string,
) {
  if (sources.length <= 1) {
    return sources[0]
  }
  const seen = new Set<string>()
  const rawSources: string[] = []
  for (const source of sources) {
    const key = `${source.sourceFile}\0${source.rawSource}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    rawSources.push(source.rawSource)
  }
  return {
    outputFile,
    rawSource: rawSources.join('\n'),
    sourceFile: sources[0]?.sourceFile ?? outputFile,
  }
}

export function collectRememberedCssReplayGroups(
  sources: Iterable<[string, RememberedCssSource]> | undefined,
  opts: Pick<InternalUserDefinedOptions, 'cssMatcher' | 'platform'>,
  rootDir: string,
  isWebGeneratorTarget: boolean,
  preserveCssExtension: boolean,
  sourceRoot?: string | undefined,
  styleOutputExtension?: string | undefined,
  styleOutputFiles?: Iterable<string> | undefined,
) {
  const groups = new Map<string, Array<{ key: string, remembered: RememberedCssSource }>>()
  const outputFiles = [...styleOutputFiles ?? []]
  const currentOutputs = new Set(outputFiles.map(normalizeOutputPathKey))
  const relationOwner = getActiveViteSourceOutputRelationOwner()
  for (const [key, remembered] of sources ?? []) {
    const ownedOutputs = [...relationOwner?.getOwnedOutputs(remembered.sourceFile) ?? []]
      .filter(file => currentOutputs.has(normalizeOutputPathKey(file)) && opts.cssMatcher(file))
    if (ownedOutputs.length === 1) {
      const outputKey = normalizeOutputPathKey(ownedOutputs[0]!)
      const group = groups.get(outputKey) ?? []
      group.push({ key, remembered })
      groups.set(outputKey, group)
      continue
    }
    const cleanSourceFile = remembered.sourceFile.replace(/[?#].*$/, '')
    const resolvedOutputFile = CSS_SOURCE_OUTPUT_EXT_RE.test(cleanSourceFile)
      ? resolveViteCssPipelineOutputFileFromSourceFile(
          remembered.sourceFile,
          opts,
          rootDir,
          isWebGeneratorTarget,
          preserveCssExtension,
          sourceRoot,
          styleOutputExtension,
          outputFiles,
        )
      : resolveViteCssPipelineOutputFileFromSourceFile(
          remembered.outputFile,
          opts,
          rootDir,
          isWebGeneratorTarget,
          preserveCssExtension,
          sourceRoot,
          styleOutputExtension,
          outputFiles,
        )
    const rememberedOutputFile = remembered.outputFile.replace(/[?#].*$/, '')
    const outputFile = opts.cssMatcher(rememberedOutputFile)
      && !normalizeOutputPathKey(rememberedOutputFile).includes('/')
      && normalizeOutputPathKey(rememberedOutputFile) !== normalizeOutputPathKey(resolvedOutputFile.replace(/[?#].*$/, ''))
      ? remembered.outputFile
      : resolvedOutputFile
    const outputKey = normalizeOutputPathKey(outputFile)
    const group = groups.get(outputKey) ?? []
    group.push({ key, remembered })
    groups.set(outputKey, group)
  }
  return groups
}
