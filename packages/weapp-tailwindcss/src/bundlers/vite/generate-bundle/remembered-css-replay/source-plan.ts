import type { RememberedCssSource } from '../types'
import { isSourcePreprocessorRequest } from '../../../../generation/style-requests'
import { normalizeOutputPathKey } from '../../../shared/module-graph'
import { canProcessViteSourceStyleAsCss, SOURCE_STYLE_OUTPUT_EXT_RE } from '../../css-output'

export function dedupeRememberedCssReplayGroup(
  group: Array<{ key: string, remembered: RememberedCssSource }>,
) {
  const bySourceAndOutput = new Map<string, { key: string, remembered: RememberedCssSource }>()
  for (const item of group) {
    const sourceKey = `${normalizeOutputPathKey(item.remembered.sourceFile)}\0${normalizeOutputPathKey(item.remembered.outputFile)}`
    bySourceAndOutput.set(sourceKey, item)
  }
  return [...bySourceAndOutput.values()]
}

export function shouldSkipRawRememberedCssSource(rawSource: string, sourceFile: string) {
  const cleanSourceFile = sourceFile.replace(/[?#].*$/, '')
  return (SOURCE_STYLE_OUTPUT_EXT_RE.test(cleanSourceFile) || isSourcePreprocessorRequest(sourceFile))
    && !canProcessViteSourceStyleAsCss(rawSource, sourceFile)
}

export function resolveRememberedCssReplayOutputFile(
  outputFile: string,
  targetByFile: ReadonlyMap<string, string> | undefined,
) {
  const outputKey = normalizeOutputPathKey(outputFile)
  for (const [shellFile, targetFile] of targetByFile ?? []) {
    if (normalizeOutputPathKey(shellFile) === outputKey) {
      return targetFile
    }
  }
  return outputFile
}
