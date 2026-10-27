import type { OutputBundle } from 'rollup'
import { Buffer } from 'node:buffer'
import { collectGeneratedRawSourceCandidatesFromCss } from '../../../generation/class-selectors'

interface RebuildJsTransformRuntimeOptions {
  bundle: Readonly<OutputBundle>
  cssMatcher: (file: string) => boolean
  debug: (format: string, ...args: unknown[]) => void
  escapeMap: Record<string, string> | undefined
  generatorRuntime: Iterable<string>
  getProcessedCssResults?: (() => Iterable<readonly [string, string | { css: string }]>) | undefined
  transformRuntime: Set<string>
}

/** CSS 任务完成后，仅用实际产物中的选择器重建本轮 JS 转译候选。 */
export function rebuildJsTransformRuntimeFromCss({
  bundle,
  cssMatcher,
  debug,
  escapeMap,
  generatorRuntime,
  getProcessedCssResults,
  transformRuntime,
}: RebuildJsTransformRuntimeOptions) {
  transformRuntime.clear()
  const cssSources = new Set<string>()
  for (const output of Object.values(bundle)) {
    if (output.type !== 'asset' || !cssMatcher(output.fileName)) {
      continue
    }
    cssSources.add(typeof output.source === 'string' ? output.source : Buffer.from(output.source).toString())
  }
  for (const [, record] of getProcessedCssResults?.() ?? []) {
    cssSources.add(typeof record === 'string' ? record : record.css)
  }
  for (const candidate of collectGeneratedRawSourceCandidatesFromCss(generatorRuntime, cssSources, escapeMap)) {
    transformRuntime.add(candidate)
  }
  debug('rebuild webview JS transform class set from generated CSS: %d', transformRuntime.size)
}
