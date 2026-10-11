export {
  escapeCssClassName,
  extractBareArbitraryValueSourceCandidates,
  extractBareArbitraryValueSourceCandidatesWithPositions,
  isBareArbitraryValuesEnabled,
  resolveBareArbitraryValueCandidate,
} from './bare-arbitrary-values.ts'
export type {
  BareArbitraryValueOptions,
  BareArbitraryValueResolveResult,
  BareArbitraryValueSourceCandidate,
} from './bare-arbitrary-values.ts'
export {
  canonicalizeBareArbitraryValueCandidates,
  extractTailwindV4InlineSourceCandidates,
  replaceBareArbitraryValueSelectors,
  resolveValidTailwindV4Candidates,
} from './candidates.ts'
export { createTailwindV4Engine } from './engine.ts'
export { createTailwindGenerationSession } from './generation-session.ts'
export {
  compileTailwindV4Source,
  getTailwindV4DesignSystemCacheKey,
  loadTailwindV4DesignSystem,
  loadTailwindV4NodeModule,
} from './node-adapter.ts'
export {
  createTailwindV4CompiledSourceEntries,
  createTailwindV4DefaultIgnoreSources,
  createTailwindV4RootSources,
  createTailwindV4SourceEntryMatcher,
  createTailwindV4SourceExclusionMatcher,
  expandTailwindV4SourceEntries,
  expandTailwindV4SourceEntryBraces,
  groupTailwindV4SourceEntriesByBase,
  isFileExcludedByTailwindV4SourceEntries,
  isFileMatchedByTailwindV4SourceEntries,
  mergeTailwindV4SourceEntries,
  normalizeGlobPattern,
  normalizeTailwindV4ScannerSources,
  normalizeTailwindV4SourceEntries,
  resolveSourceScanPath,
  resolveTailwindV4SourceBaseCandidates,
  resolveTailwindV4SourceEntry,
  TAILWIND_V4_AUTO_SOURCE_SCAN_PATTERN,
  TAILWIND_V4_IGNORED_CONTENT_DIRS,
  TAILWIND_V4_IGNORED_EXTENSIONS,
  TAILWIND_V4_IGNORED_FILES,
  toPosixPath,
} from './source-scan.ts'
export { resolveTailwindV4Source } from './source.ts'
export {
  collectTailwindV4StyleCandidates,
  generateTailwindV4Style,
} from './style-generator.ts'
export type {
  CssFragment,
  CssFragmentKind,
  GenerationChange,
  GenerationRequest,
  SourceEntry,
  TailwindGenerationArtifact,
  TailwindGenerationSession,
  TailwindGenerationSessionOptions,
  TailwindV4CandidateSource,
  TailwindV4CompiledSourceRoot,
  TailwindV4CssSource,
  TailwindV4DesignSystem,
  TailwindV4Engine,
  TailwindV4GenerateOptions,
  TailwindV4GenerateResult,
  TailwindV4ResolvedSource,
  TailwindV4SourceOptions,
  TailwindV4SourcePattern,
  TailwindV4StyleGenerateOptions,
  TailwindV4StyleGenerateResult,
  TailwindV4StyleSource,
} from './types.ts'
