import type { ChildProcessWithoutNullStreams } from 'node:child_process'

export type WatchProjectGroup = 'demo'
export type DemoWatchShardName
  = | 'demo-core'
    | 'demo-taro-react'
    | 'demo-taro-vue3'
    | 'demo-uni'
export type ConcreteWatchCaseName
  = | 'gulp-tailwindcss-v4'
    | 'mpx-tailwindcss-v4'
    | 'taro-webpack-react-tailwindcss-v4'
    | 'taro-vite-react-tailwindcss-v4'
    | 'taro-webpack-vue3-tailwindcss-v4'
    | 'taro-vite-vue3-tailwindcss-v4'
    | 'uni-app-vite-tailwindcss-v4'
    | 'uni-app-vite-vue3-hbuilderx-tailwindcss-v4'
    | 'uni-app-x-vdom-tailwindcss-v4'
    | 'weapp-vite-tailwindcss-v4'
export type TaroMiniProgramWatchPlatform = 'weapp' | 'alipay' | 'tt'
export type UniAppMiniProgramWatchPlatform = 'mp-weixin' | 'mp-alipay' | 'mp-qq' | 'mp-toutiao'
export type PlatformWatchCaseName = `${ConcreteWatchCaseName}:${string}`
export type ConcreteOrPlatformWatchCaseName = ConcreteWatchCaseName | PlatformWatchCaseName
export type WatchCaseName = ConcreteOrPlatformWatchCaseName | 'both' | 'all' | 'demo' | DemoWatchShardName
export const MUTATION_ROUND_NAMES = ['baseline-arbitrary', 'complex-corpus', 'hex-arbitrary', 'issue33-arbitrary', 'named-arbitrary-colors'] as const
export const DEFAULT_HOT_UPDATE_BUDGET_MS = 1000
export const PREFERRED_HOT_UPDATE_TARGET_MS = 1000
export const DEFAULT_PLUGIN_PROCESS_BUDGET_MS = 500
export type MutationRoundName = typeof MUTATION_ROUND_NAMES[number]
export type MutationKind = 'template' | 'script' | 'style' | 'content'
export type ClassMutationKind = 'template' | 'script' | 'content'
export type MiniProgramScope = 'main-package' | 'subpackages'

export interface CliOptions {
  caseName: WatchCaseName
  timeoutMs: number
  pollMs: number
  skipBuild: boolean
  quietSass: boolean
  webOnly: boolean
  miniProgramOnly: boolean
  miniProgramScope?: MiniProgramScope
  styleOnly: boolean
  mainStyleOnly: boolean
  mainStyleSubPackageLimit?: number
  reportFile?: string
  maxHotUpdateMs?: number
  maxPluginProcessMs?: number
  maxMemoryRssMb?: number
  maxMemoryRssDeltaMb?: number
  maxMemoryHeapUsedMb?: number
}

export interface PluginProcessSample {
  at: number
  bundler: string
  phase: string
  durationMs: number
  file?: string
  metric?: 'hook' | 'total'
  wallMs?: number
  details?: Record<string, unknown>
}

export interface HmrMemoryDebugSample {
  at: number
  bundler: string
  phase: string
  durationMs: number
  data: Record<string, unknown>
}

export interface MemoryProcessSample {
  pid: number
  ppid: number
  rssMb: number
  command?: string
}

export interface MemoryUsageSample {
  at: number
  rssMb: number
  maxProcessRssMb: number
  processCount: number
  topProcesses?: MemoryProcessSample[]
}

export interface MemoryPeakSample {
  at: number
  rssMb: number
  maxProcessRssMb: number
  processCount: number
  topProcesses?: MemoryProcessSample[]
}

export interface MemoryUsageSummary {
  count: number
  baselineRssMb: number
  peakRssMb: number
  steadyRssMb: number
  steadyGrowthPct: number
  rssDeltaMb: number
  peakMaxProcessRssMb: number
  peakProcessCount: number
  uniqueProcessCount: number
  firstAt?: number
  lastAt?: number
  durationMs: number
  peakSample?: MemoryPeakSample
}

export interface HmrMemoryDebugSummary {
  count: number
  peakHeapUsedMb: number
  peakRssMb: number
  peakStaleCacheKeys: number
  peakStaleHashKeys: number
  byBundlerPhase: Record<string, {
    count: number
    peakHeapUsedMb: number
    peakRssMb: number
    peakStaleCacheKeys: number
    peakStaleHashKeys: number
    pruneSkippedCount: number
    omittedKnownFilesCount: number
  }>
  topHeapPhases: Array<{
    phase: string
    count: number
    peakHeapUsedMb: number
    peakRssMb: number
    peakStaleCacheKeys: number
    peakStaleHashKeys: number
    pruneSkippedCount: number
    omittedKnownFilesCount: number
  }>
  topStaleCachePhases: Array<{
    phase: string
    count: number
    peakStaleCacheKeys: number
    peakStaleHashKeys: number
    pruneSkippedCount: number
    omittedKnownFilesCount: number
  }>
  topDurationPhases: Array<{
    phase: string
    count: number
    peakDurationMs: number
    peakDurationActiveCss: number
    peakDurationStaleCacheKeys: number
    peakDurationStaleHashKeys: number
    peakDurationPruneSkipped: boolean
    peakDurationOmittedKnownFiles: boolean
  }>
}

export interface ClassMutationPayload {
  marker: string
  classLiteral: string
  classVariableName: string
}

export interface StyleMutationPayload {
  marker: string
  styleNeedle: string
  outputNeedles: string[]
  rollbackNeedles: string[]
  applyUtilities: string[]
  expectedApplyDeclarations: string[]
  expectedApplyDeclarationGroups: string[][]
  functionNeedle?: string
  functionDeclarations: string[]
  expectedFunctionDeclarations: string[]
  forbiddenFunctionFragments: string[]
  referenceDirective?: string
}

export interface MutationRoundConfig {
  name: MutationRoundName
  buildClassTokens: (seed: string) => string[]
  buildModifyClassTokens?: (seed: string) => string[]
}

export interface StyleApplyValidation {
  utilities: string[]
  expectedDeclarations: string[]
  expectedDeclarationGroups?: string[][]
}

export interface MutationScenario extends ClassMutationPayload {
  roundName: MutationRoundName
  classTokens: string[]
  escapedClasses: string[]
  freshEscapedClasses: string[]
  mutatedSource: string
}

export interface CssRuleRemovalExpectation {
  utility: string
  condition: 'supports' | 'hover'
}

export interface ClassMutationConfig {
  sourceFile: string
  verifyEscapedIn: Array<'wxml' | 'js'>
  verifyClassLiteralIn?: Array<'wxml' | 'js'>
  verifyAllEscapedClasses?: boolean
  verifyAllClassLiterals?: boolean
  forbidBgHexTruncationIn?: Array<'wxml' | 'js'>
  /** 平台契约明确移除的规则；仍验证 token 传播、CSS 缺失和回滚，不因实际缺失自动豁免。 */
  expectedRemovedCssUtilities?: readonly CssRuleRemovalExpectation[]
  roundConfigs?: MutationRoundConfig[]
  skipExtendedHmr?: boolean
  /**
   * comment-carrier 热更新是否要求新增候选同时出现在全局样式中。
   *
   * JavaScript 注释不会被 Tailwind v4 的候选扫描器视为 class 候选，
   * 因此这类场景可以只验证 marker 传播和回滚结果。
   */
  commentCarrierMinRequiredGlobalStyleEscapedClasses?: number
  mutate: (source: string, payload: ClassMutationPayload) => string
  mutateCommentCarrier?: (source: string, payload: ClassMutationPayload) => string
}

export interface StyleMutationConfig {
  sourceFile: string
  importerFiles?: string[]
  verifyOutputCandidates?: string[]
  validateApply?: boolean
  validateFunction?: boolean
  outputStyleNeedle?: (payload: StyleMutationPayload) => string
  outputNeedles?: (payload: StyleMutationPayload) => string[]
  rollbackNeedles?: (payload: StyleMutationPayload) => string[]
  mutate: (source: string, payload: StyleMutationPayload) => string
}

export interface OutputIntegrityGuard {
  directory?: string
  file?: string
  forbiddenFragments?: string[]
  forbidEmptyBlockAtRules?: boolean
}

export interface UserReportedHotUpdateConfig {
  label: string
  sourceFile: string
  before: string
  after: string
  beforeClassTokens: string[]
  afterClassTokens: string[]
  verifyEscapedIn: Array<'wxml' | 'js'>
  verifyClassLiteralIn?: Array<'wxml' | 'js'>
  minRequiredGlobalStyleEscapedClasses?: number
}

export interface IconifyHotUpdateConfig {
  sourceFile: string
  beforeContentClass?: string
  afterContentClass?: string
  iconClassTokens?: string[]
  mutate?: (source: string, payload: IconifyHotUpdatePayload) => string
}

export interface IconifyHotUpdatePayload {
  marker: string
  classLiteral: string
  iconClassTokens: string[]
  beforeContentClass: string
  afterContentClass: string
}

export interface WatchCase {
  name: ConcreteOrPlatformWatchCaseName
  label: string
  project: string
  group: WatchProjectGroup
  requireInitialCompileSuccess?: boolean
  requireInitialTemplateOutput?: boolean
  initialMutationDelayMs?: number
  initialBuildScript?: string
  maxPluginProcessMs?: number
  minGlobalStyleEscapedClasses?: number
  requireStableGlobalStyleOnSameClassLiteral?: boolean
  cwd: string
  devScript: string
  env?: Record<string, string>
  outputWxml: string
  outputJs: string
  outputStyleCandidates: string[]
  globalStyleCandidates: string[]
  outputIntegrityGuards?: OutputIntegrityGuard[]
  contentMutation?: ClassMutationConfig
  iconifyHmr?: IconifyHotUpdateConfig
  userReportedHotUpdate?: UserReportedHotUpdateConfig
  templateMutation: ClassMutationConfig
  scriptMutation: ClassMutationConfig
  styleMutation: StyleMutationConfig
  subPackageMutations?: SubPackageMutationConfig[]
  splitSubPackageWatchSessions?: boolean
  skipStyleMutation?: boolean
  skipWebHmrInFullRun?: boolean
  webHmr?: WebHmrConfig
}

export interface SubPackageMutationConfig {
  root: 'sub-normal' | 'sub-independent'
  independent: boolean
  outputWxml: string
  outputJs: string
  outputStyleCandidates: string[]
  globalStyleCandidates: string[]
  minGlobalStyleEscapedClasses?: number
  templateMutation: ClassMutationConfig
  mainStyleMutation?: ClassMutationConfig
  styleMutation: StyleMutationConfig
  skipStyleMutation?: boolean
}

export interface WebHmrConfig {
  devScript: string
  devArgs?: string[]
  sourceFile: string
  cssEntryFile?: string
  injectMarkerElement?: boolean
  readySelector?: string
  initialMutationDelayMs?: number
  waitForInitialCompileSettled?: boolean
  initialCompileSettleTimeoutMs?: number
  reloadAfterCssMutation?: boolean
  reloadOnHmrStall?: boolean
  hmrReloadStallMs?: number
  touchCssEntryOnSourceMutation?: boolean
  compileSettleTimeoutMs?: number
  mutate: (source: string, payload: ClassMutationPayload) => string
  env?: Record<string, string>
  classLiteral?: string
  rollbackClassLiteral?: string
  expectedStyle?: Partial<Record<'backgroundColor' | 'width' | 'height', string>>
  rollbackExpectedStyle?: Partial<Record<'backgroundColor' | 'width' | 'height', string>>
  sourceClassReplacementSequence?: WebHmrSourceClassReplacement[]
  sourceDomReplacementSequence?: WebHmrSourceDomReplacement[]
  iconifyHmr?: WebIconifyHmrConfig
}

export interface WebIconifyHmrConfig {
  beforeContentClass?: string
  afterContentClass?: string
  iconClassTokens?: string[]
  mutate?: (source: string, payload: IconifyHotUpdatePayload) => string
}

export interface WebHmrSourceClassReplacement {
  label: string
  from: string
  to: string
  expectedCssIncludes?: string[]
}

export interface WebHmrSourceDomReplacement {
  label: string
  beforeSelector?: string
  selector?: string
  mutate: (source: string) => {
    next: string
    from: string
    to: string
  }
  expectedText: string
  expectedStyle?: Partial<Record<'color' | 'backgroundColor' | 'width' | 'height', string>>
  expectedCssIncludes?: string[]
}

export interface WatchSession {
  /** 可选探针取消信号，由发起该轮探针的生命周期持有。 */
  signal?: AbortSignal | undefined
  child: ChildProcessWithoutNullStreams
  ensureRunning: () => void
  lastCompileSuccessAt: () => number
  logs: () => string
  stop: () => Promise<void>
  memorySamplesSince: (startedAt: number) => MemoryUsageSample[]
  memoryDebugSamplesSince: (startedAt: number) => HmrMemoryDebugSample[]
  pluginProcessSamplesSince: (startedAt: number) => PluginProcessSample[]
}

export interface OutputMtime {
  wxml: number
  js: number
}

export interface OutputWaitDiagnostics {
  trigger: 'exact-mtime' | 'glob-mtime' | 'semantic'
  elapsedMs: number
  fileCount: number
  resolvedFileCount: number
  exactFileUpdated: boolean
  globFileUpdated: boolean
  semanticAccepted: boolean
  missingExactFiles: string[]
  updatedFiles: string[]
}

export interface MutationRoundMetrics {
  roundName: MutationRoundName
  marker: string
  classLiteral: string
  classTokens: string[]
  escapedClasses: string[]
  hotUpdateOutputMs: number
  hotUpdateEffectiveMs: number
  hotUpdateOutputDiagnostics?: OutputWaitDiagnostics
  hotUpdatePluginProcessMs: number
  hotUpdatePluginProcessSamples: PluginProcessSample[]
  rollbackOutputMs: number
  rollbackEffectiveMs: number
  rollbackOutputDiagnostics?: OutputWaitDiagnostics
  rollbackPluginProcessMs: number
  rollbackPluginProcessSamples: PluginProcessSample[]
  totalMs: number
}

export interface WatchCaseRoundComparison {
  baselineRoundName: MutationRoundName
  candidateRoundName: MutationRoundName
  hotUpdateDeltaMs: number
  rollbackDeltaMs: number
  hotUpdateRatio: number
  rollbackRatio: number
}

export interface ClassMutationMetrics {
  mutationKind: ClassMutationKind
  sourceFile: string
  marker: string
  classLiteral: string
  classTokens: string[]
  escapedClasses: string[]
  rounds: MutationRoundMetrics[]
  roundComparison?: WatchCaseRoundComparison
  verifyEscapedIn: Array<'wxml' | 'js'>
  verifyClassLiteralIn: Array<'wxml' | 'js'>
  globalStyleOutputs: string[]
  minRequiredGlobalStyleEscapedClasses: number
  verifiedGlobalStyleEscapedClasses: string[]
  hotUpdateOutputMs: number
  hotUpdateEffectiveMs: number
  hotUpdateOutputDiagnostics?: OutputWaitDiagnostics
  hotUpdatePluginProcessMs: number
  hotUpdatePluginProcessSamples: PluginProcessSample[]
  rollbackOutputMs: number
  rollbackEffectiveMs: number
  rollbackOutputDiagnostics?: OutputWaitDiagnostics
  rollbackPluginProcessMs: number
  rollbackPluginProcessSamples: PluginProcessSample[]
  addedClassHmr?: AddedClassHmrMetrics
  sameClassLiteralHmr?: SameClassLiteralHmrMetrics
  commentCarrierHmr?: CommentCarrierHmrMetrics
}

export interface AddedClassHmrMetrics {
  markerBefore: string
  markerAfter: string
  classLiteralBefore: string
  classLiteralAfter: string
  addedClassLiteral: string
  addedClassTokens: string[]
  addedEscapedClasses: string[]
  verifiedAddedEscapedClasses: string[]
  minRequiredEscapedClasses: number
  hotUpdateOutputMs: number
  hotUpdateEffectiveMs: number
  hotUpdateOutputDiagnostics?: OutputWaitDiagnostics
  hotUpdatePluginProcessMs: number
  hotUpdatePluginProcessSamples: PluginProcessSample[]
  rollbackOutputMs: number
  rollbackEffectiveMs: number
  rollbackOutputDiagnostics?: OutputWaitDiagnostics
  rollbackPluginProcessMs: number
  rollbackPluginProcessSamples: PluginProcessSample[]
}

export interface SameClassLiteralHmrMetrics {
  markerBefore: string
  markerAfter: string
  classLiteral: string
  escapedClasses: string[]
  verifiedEscapedClasses: string[]
  minRequiredEscapedClasses: number
  stableGlobalStyleRequired: boolean
  stableGlobalStyleOutputs: string[]
  changedGlobalStyleOutputs: string[]
  hotUpdateOutputMs: number
  hotUpdateEffectiveMs: number
  hotUpdateOutputDiagnostics?: OutputWaitDiagnostics
  hotUpdatePluginProcessMs: number
  hotUpdatePluginProcessSamples: PluginProcessSample[]
  rollbackOutputMs: number
  rollbackEffectiveMs: number
  rollbackOutputDiagnostics?: OutputWaitDiagnostics
  rollbackPluginProcessMs: number
  rollbackPluginProcessSamples: PluginProcessSample[]
}

export interface CommentCarrierHmrMetrics {
  marker: string
  classLiteral: string
  escapedClasses: string[]
  verifiedEscapedClasses: string[]
  minRequiredEscapedClasses: number
  hotUpdateOutputMs: number
  hotUpdateEffectiveMs: number
  hotUpdateOutputDiagnostics?: OutputWaitDiagnostics
  hotUpdatePluginProcessMs: number
  hotUpdatePluginProcessSamples: PluginProcessSample[]
  rollbackOutputMs: number
  rollbackEffectiveMs: number
  rollbackOutputDiagnostics?: OutputWaitDiagnostics
  rollbackPluginProcessMs: number
  rollbackPluginProcessSamples: PluginProcessSample[]
}

export interface StyleMutationMetrics {
  mutationKind: 'style'
  sourceFile: string
  outputStyle: string
  marker: string
  styleNeedle: string
  outputNeedles: string[]
  rollbackNeedles: string[]
  applyUtilities: string[]
  expectedApplyDeclarations: string[]
  expectedApplyDeclarationGroups: string[][]
  functionNeedle?: string
  functionDeclarations: string[]
  expectedFunctionDeclarations: string[]
  forbiddenFunctionFragments: string[]
  referenceDirective?: string
  hotUpdateOutputMs: number
  hotUpdateEffectiveMs: number
  hotUpdateOutputDiagnostics?: OutputWaitDiagnostics
  hotUpdatePluginProcessMs: number
  hotUpdatePluginProcessSamples: PluginProcessSample[]
  rollbackOutputMs: number
  rollbackEffectiveMs: number
  rollbackOutputDiagnostics?: OutputWaitDiagnostics
  rollbackPluginProcessMs: number
  rollbackPluginProcessSamples: PluginProcessSample[]
  rollbackNeedleCleared: boolean
}

export interface UserReportedHotUpdateMetrics {
  label: string
  sourceFile: string
  from: string
  to: string
  classTokens: string[]
  escapedClasses: string[]
  verifiedGlobalStyleEscapedClasses: string[]
  minRequiredGlobalStyleEscapedClasses: number
  hotUpdateOutputMs: number
  hotUpdateEffectiveMs: number
  hotUpdateOutputDiagnostics?: OutputWaitDiagnostics
  hotUpdatePluginProcessMs: number
  hotUpdatePluginProcessSamples: PluginProcessSample[]
  rollbackOutputMs: number
  rollbackEffectiveMs: number
  rollbackOutputDiagnostics?: OutputWaitDiagnostics
  rollbackPluginProcessMs: number
  rollbackPluginProcessSamples: PluginProcessSample[]
}

export interface IconifyHotUpdateMetrics {
  sourceFile: string
  marker: string
  beforeContentClass: string
  afterContentClass: string
  iconClassTokens: string[]
  contentClassTokens: string[]
  preservedIconEscapedClasses: string[]
  verifiedContentEscapedClasses: string[]
  globalStyleOutputs: string[]
  hotUpdateOutputMs: number
  hotUpdateEffectiveMs: number
  hotUpdateOutputDiagnostics?: OutputWaitDiagnostics
  hotUpdatePluginProcessMs: number
  hotUpdatePluginProcessSamples: PluginProcessSample[]
  rollbackOutputMs: number
  rollbackEffectiveMs: number
  rollbackOutputDiagnostics?: OutputWaitDiagnostics
  rollbackPluginProcessMs: number
  rollbackPluginProcessSamples: PluginProcessSample[]
}

export interface MainStyleHotUpdateMetrics {
  label: string
  mutationKind: ClassMutationKind
  sourceFile: string
  verifyEscapedIn: Array<'wxml' | 'js'>
  verifyClassLiteralIn: Array<'wxml' | 'js'>
  fromClassToken: string
  toClassToken: string
  fromEscapedClass: string
  toEscapedClass: string
  verifiedGlobalStyleEscapedClasses: string[]
  minRequiredGlobalStyleEscapedClasses: number
  rollbackVerifiedGlobalStyleRemovedClasses: string[]
  hotUpdateOutputMs: number
  hotUpdateEffectiveMs: number
  hotUpdateOutputDiagnostics?: OutputWaitDiagnostics
  hotUpdatePluginProcessMs: number
  hotUpdatePluginProcessSamples: PluginProcessSample[]
  rollbackOutputMs: number
  rollbackEffectiveMs: number
  rollbackOutputDiagnostics?: OutputWaitDiagnostics
  rollbackPluginProcessMs: number
  rollbackPluginProcessSamples: PluginProcessSample[]
}

export type WatchCaseMutationMetrics = ClassMutationMetrics | StyleMutationMetrics

export interface SubPackageMutationMetrics {
  root: SubPackageMutationConfig['root']
  independent: boolean
  outputWxml: string
  outputJs: string
  globalStyleOutputs: string[]
  mainStyleHotUpdate?: MainStyleHotUpdateMetrics
  template: ClassMutationMetrics
  style?: StyleMutationMetrics
}

export interface SubPackageMainStyleHotUpdateMetrics {
  root: SubPackageMutationConfig['root']
  independent: boolean
  outputWxml: string
  outputJs: string
  globalStyleOutputs: string[]
  mainStyleHotUpdate: MainStyleHotUpdateMetrics
}

export interface WatchSummary {
  count: number
  hotUpdateAvgMs: number
  hotUpdateMaxMs: number
  hotUpdateMinMs: number
  rollbackAvgMs: number
  rollbackMaxMs: number
  rollbackMinMs: number
}

export interface WatchArtifactEntry {
  file: string
  absoluteFile: string
  exists: boolean
  size: number
  sha256?: string
  kind?: 'text' | 'binary'
  content?: string
  contentOmittedReason?: 'binary' | 'large-text'
}

export interface WatchArtifactSnapshot {
  phase: 'dev' | 'hmr'
  capturedAt: string
  requestedHmrCount?: number
  capturedAfterHmrCount?: number
  files: WatchArtifactEntry[]
}

export interface WatchArtifactDiffEntry {
  file: string
  status: 'added' | 'removed' | 'changed' | 'unchanged'
  beforeSha256?: string
  afterSha256?: string
  beforeSize?: number
  afterSize?: number
  diff?: string
}

export interface WatchArtifactDiff {
  from: 'dev'
  to: 'hmr'
  requestedHmrCount: number
  capturedAfterHmrCount: number
  changedFileCount: number
  files: WatchArtifactDiffEntry[]
  text: string
}

export interface WatchCaseArtifacts {
  requestedHmrCount: number
  capturedAfterHmrCount: number
  dev: WatchArtifactSnapshot
  hmr: WatchArtifactSnapshot
  diff: WatchArtifactDiff
}

export interface HmrDurationTiming {
  surface: string
  sourceFile?: string
  hotUpdateEffectiveMs: number
  rollbackEffectiveMs?: number
  hotUpdatePluginProcessMs?: number
  hotUpdateOutputDiagnostics?: OutputWaitDiagnostics
  rollbackOutputDiagnostics?: OutputWaitDiagnostics
}

export interface ProjectHmrDurationReport {
  name: WatchCase['name']
  label: string
  project: string
  projectGroup: WatchProjectGroup
  initialReadyMs: number
  totalMs: number
  timings: HmrDurationTiming[]
}

export interface HmrDurationReport {
  summaryBySurface: Record<string, WatchSummary>
  byProject: Record<string, ProjectHmrDurationReport>
}

export interface WatchCaseMetrics {
  name: WatchCase['name']
  label: string
  project: string
  projectGroup: WatchProjectGroup
  marker: string
  classLiteral: string
  classTokens: string[]
  escapedClasses: string[]
  rounds: MutationRoundMetrics[]
  roundComparison?: WatchCaseRoundComparison
  verifyEscapedIn: Array<'wxml' | 'js'>
  verifyClassLiteralIn: Array<'wxml' | 'js'>
  globalStyleOutputs: string[]
  mutationMetrics: WatchCaseMutationMetrics[]
  mainStyleHotUpdate?: MainStyleHotUpdateMetrics
  subPackageMainStyleHotUpdates?: SubPackageMainStyleHotUpdateMetrics[]
  userReportedHotUpdate?: UserReportedHotUpdateMetrics
  iconifyHmr?: IconifyHotUpdateMetrics
  webHmr?: WebHmrMetrics
  subPackageMutationMetrics: SubPackageMutationMetrics[]
  summaryByMutationKind: Partial<Record<MutationKind, WatchSummary>>
  initialReadyMs: number
  maxPluginProcessMs?: number
  hotUpdateOutputMs: number
  hotUpdateEffectiveMs: number
  hotUpdatePluginProcessMs: number
  hotUpdatePluginProcessSamples: PluginProcessSample[]
  rollbackOutputMs: number
  rollbackEffectiveMs: number
  rollbackPluginProcessMs: number
  rollbackPluginProcessSamples: PluginProcessSample[]
  totalMs: number
  memorySamples: MemoryUsageSample[]
  memoryDebugSamples?: HmrMemoryDebugSample[]
  memorySummary: MemoryUsageSummary
  memoryDebugSummary: HmrMemoryDebugSummary
  memoryPeakRssMb: number
  memoryRssDeltaMb: number
  artifacts?: WatchCaseArtifacts
}

export interface WebHmrMetrics {
  devScript: string
  sourceFile: string
  url: string
  marker: string
  classLiteral: string
  computedStyle: {
    backgroundColor: string
    width: string
    height: string
  }
  initialReadyMs: number
  hotUpdateEffectiveMs: number
  hotUpdatePluginProcessMs: number
  hotUpdatePluginProcessSamples: PluginProcessSample[]
  rollbackEffectiveMs: number
  rollbackPluginProcessMs: number
  rollbackPluginProcessSamples: PluginProcessSample[]
  sourceClassReplacementSequence?: WebHmrSourceClassReplacementMetrics[]
  sourceDomReplacementSequence?: WebHmrSourceDomReplacementMetrics[]
  iconifyHmr?: WebIconifyHmrMetrics
  memorySamples: MemoryUsageSample[]
  memoryDebugSamples?: HmrMemoryDebugSample[]
  totalMs: number
}

export interface WebIconifyHmrMetrics {
  marker: string
  beforeContentClass: string
  afterContentClass: string
  iconClassTokens: string[]
  contentClassTokens: string[]
  preservedIconCssIncludes: string[]
  verifiedContentCssIncludes: string[]
  hotUpdateEffectiveMs: number
}

export interface WebHmrSourceClassReplacementMetrics {
  label: string
  from: string
  to: string
  verifiedCssIncludes: string[]
  hotUpdateEffectiveMs: number
}

export interface WebHmrSourceDomReplacementMetrics {
  label: string
  selector?: string
  from: string
  to: string
  expectedText: string
  expectedStyle: Partial<Record<'color' | 'backgroundColor' | 'width' | 'height', string | undefined>>
  verifiedCssIncludes: string[]
  computedStyle: Partial<Record<'color' | 'backgroundColor' | 'width' | 'height', string>>
  hotUpdateEffectiveMs: number
}

export interface WatchReport {
  generatedAt: string
  repositoryRoot: string
  options: {
    caseName: CliOptions['caseName']
    timeoutMs: number
    pollMs: number
    skipBuild: boolean
    quietSass: boolean
    webOnly: boolean
    miniProgramOnly: boolean
    miniProgramScope?: MiniProgramScope
    styleOnly: boolean
    mainStyleOnly: boolean
    mainStyleSubPackageLimit?: number
    maxHotUpdateMs?: number
    maxPluginProcessMs?: number
    maxMemoryRssMb?: number
    maxMemoryRssDeltaMb?: number
    maxMemoryHeapUsedMb?: number
  }
  summary: WatchSummary
  summaryByRound: Partial<Record<MutationRoundName, WatchSummary>>
  summaryByGroup: Partial<Record<WatchProjectGroup, WatchSummary>>
  summaryByProject: Record<string, WatchSummary>
  summaryByMutationKind: Partial<Record<MutationKind, WatchSummary>>
  hmrDurations: HmrDurationReport
  memoryReport: HmrMemoryReport
  cases: WatchCaseMetrics[]
}

export interface HmrMemoryProjectReport {
  name: WatchCase['name']
  label: string
  project: string
  projectGroup: WatchProjectGroup
  initialReadyMs: number
  totalMs: number
  sampleCount: number
  debugSampleCount: number
  baselineRssMb: number
  peakRssMb: number
  steadyRssMb: number
  steadyGrowthPct: number
  rssDeltaMb: number
  peakMaxProcessRssMb: number
  peakProcessCount: number
  uniqueProcessCount: number
  peakHeapUsedMb: number
  peakDebugRssMb: number
  peakSample?: MemoryPeakSample
  topHeapPhases: HmrMemoryDebugSummary['topHeapPhases']
  topStaleCachePhases: HmrMemoryDebugSummary['topStaleCachePhases']
  topDurationPhases: HmrMemoryDebugSummary['topDurationPhases']
}

export interface HmrMemoryReport {
  summary: {
    projectCount: number
    sampleCount: number
    debugSampleCount: number
    peakRssMb: number
    peakSteadyRssMb: number
    maxSteadyGrowthPct: number
    maxRssDeltaMb: number
    peakHeapUsedMb: number
  }
  byProject: Record<string, HmrMemoryProjectReport>
}

export const DEFAULT_STYLE_APPLY_VALIDATION: StyleApplyValidation = {
  utilities: ['font-bold', 'text-center', 'bg-[#123456]', 'px-[12px]'],
  expectedDeclarations: [
    'font-weight:',
    'text-align:',
    'background-color:',
  ],
  expectedDeclarationGroups: [
    ['padding-inline:', 'padding-left:'],
    ['padding-inline:', 'padding-right:'],
  ],
}

export const STYLE_APPLY_UNSUPPORTED_CASES = new Set<ConcreteWatchCaseName>([
  'mpx-tailwindcss-v4',
  'uni-app-vite-tailwindcss-v4',
  'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
  'uni-app-x-vdom-tailwindcss-v4',
  'taro-vite-react-tailwindcss-v4',
  'taro-webpack-react-tailwindcss-v4',
  'weapp-vite-tailwindcss-v4',
])

export const STYLE_FUNCTION_UNSUPPORTED_CASES = new Set<ConcreteWatchCaseName>([
  'mpx-tailwindcss-v4',
  'uni-app-x-vdom-tailwindcss-v4',
  'taro-vite-react-tailwindcss-v4',
  'taro-webpack-react-tailwindcss-v4',
  'weapp-vite-tailwindcss-v4',
])

export const STYLE_REFERENCE_REQUIRED_CASES = new Set<ConcreteWatchCaseName>([
  'gulp-tailwindcss-v4',
  'uni-app-vite-tailwindcss-v4',
  'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
  'uni-app-x-vdom-tailwindcss-v4',
  'mpx-tailwindcss-v4',
  'taro-vite-react-tailwindcss-v4',
  'taro-vite-vue3-tailwindcss-v4',
  'taro-webpack-react-tailwindcss-v4',
  'taro-webpack-vue3-tailwindcss-v4',
  'weapp-vite-tailwindcss-v4',
])
