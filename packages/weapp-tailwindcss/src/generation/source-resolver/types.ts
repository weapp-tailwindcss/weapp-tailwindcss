import type { SourceSideCssEntryOptions } from '../source-files'
import type { resolveTailwindV4SourceOptionsFromRuntime } from '@/generator/index'
import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import type { InternalUserDefinedOptions } from '@/types/index'

export interface GeneratorSourceRuntimeState {
  tailwindRuntime: InternalUserDefinedOptions['tailwindRuntime']
}

export interface GeneratorSourceSelectionOptions {
  runtime?: Set<string> | undefined
  getSourceCandidatesForEntries?: ((entries: TailwindSourceEntry[] | undefined) => Set<string>) | undefined
  cssEntries?: string[] | undefined
  cssSources?: TailwindV4CssSource[] | undefined
}

export type TailwindV4SourceOptions = ReturnType<typeof resolveTailwindV4SourceOptionsFromRuntime> & {
  config?: string | undefined
  outputRoot?: string | undefined
  sourceFile?: string | undefined
}

export type TailwindV4CssSource = NonNullable<TailwindV4SourceOptions['cssSources']>[number]
export type TailwindV4CssSourceRef = Pick<TailwindV4CssSource, 'file'>
export interface SourceStyleMatchOptions extends SourceSideCssEntryOptions {}
