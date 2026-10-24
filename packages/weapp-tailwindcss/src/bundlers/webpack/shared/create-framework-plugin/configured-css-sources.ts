import type { CompilerRuntimeState } from '@/compiler/runtime-state'
import path from 'node:path'
import { resolveTailwindcssOptions } from '@/tailwindcss/runtime-options'

/** 汇总显式入口与运行时来源，供资产准备和过期来源清理共用。 */
export function collectConfiguredCssSourceFiles(
  cssEntries: readonly string[] | undefined,
  runtime: Pick<CompilerRuntimeState['tailwindRuntime'], 'options'>,
) {
  const tailwindOptions = resolveTailwindcssOptions(runtime.options)
  const files = new Set<string>()
  for (const entry of cssEntries ?? []) {
    files.add(path.resolve(entry))
  }
  for (const entry of tailwindOptions?.v4?.cssEntries ?? []) {
    files.add(path.resolve(entry))
  }
  for (const source of tailwindOptions?.v4?.cssSources ?? []) {
    if (source.file) {
      files.add(path.resolve(source.file))
    }
  }
  return files
}
