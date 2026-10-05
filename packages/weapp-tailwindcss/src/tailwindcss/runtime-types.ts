import type { PackageResolvingOptions } from './package-options'
import type { TailwindSourceEntry } from './source-scan'
import type { TailwindV4SourceOptions } from './v4-engine'

type TailwindV4CssSource = NonNullable<TailwindV4SourceOptions['cssSources']>[number]

export interface LengthUnitsRuntimeOptions {
  units?: string[] | undefined
  rem2rpx?: boolean | undefined
  [key: string]: unknown
}

export interface ExtendLengthUnitsOptions extends Partial<LengthUnitsRuntimeOptions> {
  enabled?: boolean | undefined
}

export type CacheStrategy = 'merge' | 'overwrite'
export type CacheDriver = 'file' | 'memory' | 'noop'

export interface CacheOptions {
  enabled?: boolean | undefined
  cwd?: string | undefined
  dir?: string | undefined
  file?: string | undefined
  strategy?: CacheStrategy | undefined
  driver?: CacheDriver | undefined
}

export interface ExtractOptions {
  write?: boolean | undefined
  file?: string | undefined
  format?: 'json' | 'lines' | undefined
  pretty?: number | boolean | undefined
  removeUniversalSelector?: boolean | undefined
}

export interface ExposeContextOptions {
  refProperty?: string | undefined
}

export interface ApplyOptions {
  overwrite?: boolean | undefined
  exposeContext?: boolean | ExposeContextOptions | undefined
  extendLengthUnits?: false | ExtendLengthUnitsOptions | undefined
}

export interface TailwindRuntimeOptionsBase {
  config?: string | undefined
  cwd?: string | undefined
  postcssPlugin?: string | undefined
}

export interface TailwindV4Options {
  base?: string | undefined
  css?: string | undefined
  cssSources?: TailwindV4CssSource[] | undefined
  cssEntries?: string[] | undefined
  sources?: TailwindSourceEntry[] | undefined
  bareArbitraryValues?: boolean | {
    units?: string[] | undefined
  } | undefined
}

export interface TailwindCssOptions extends TailwindRuntimeOptionsBase {
  version?: 4 | undefined
  packageName?: string | undefined
  resolve?: PackageResolvingOptions | undefined
  v4?: TailwindV4Options | undefined
}

export interface TailwindCssRuntimeOptions {
  projectRoot?: string | undefined
  tailwindcss?: TailwindCssOptions | undefined
  apply?: ApplyOptions | undefined
  extract?: ExtractOptions | undefined
  filter?: ((className: string) => boolean) | undefined
  cache?: boolean | CacheOptions | undefined
}

export interface TailwindPackageInfo {
  name: string
  version: string | undefined
  rootPath: string
  packageJsonPath: string
  packageJson: Record<string, unknown>
}

export interface TailwindcssExtractOptions extends ExtractOptions {}

export interface TailwindcssExtractResult {
  classList: string[]
  classSet: Set<string>
  filename?: string | undefined
}

export interface TailwindContentTokenReport {
  entries: unknown[]
  filesScanned: number
  sources: unknown[]
  skippedFiles: unknown[]
}
