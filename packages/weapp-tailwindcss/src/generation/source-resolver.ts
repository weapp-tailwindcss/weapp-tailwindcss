export type { GeneratorResolvedSource, GeneratorSourceMetadata, GeneratorSourceRecord } from './source-resolver/metadata'
export { createGeneratorSourceRecord, getGeneratorSourceMetadata } from './source-resolver/metadata'
export { resolveCssSourceBase } from './source-resolver/postcss-source'
export { resolveGeneratorSource } from './source-resolver/resolve-source'

export { resolveGeneratorSources } from './source-resolver/resolve-sources'
export { resolveGeneratorSourceEntries } from './source-resolver/source-entries'
export type { GeneratorSourceRuntimeState, GeneratorSourceSelectionOptions } from './source-resolver/types'
