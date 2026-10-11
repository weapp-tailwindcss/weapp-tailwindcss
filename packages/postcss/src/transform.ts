export {
  type PostcssAppType,
  type PostcssStyleBranch,
  type PostcssStyleBranchProfile,
  resolvePostcssStyleBranch,
  type ResolvePostcssStyleBranchOptions,
  resolvePostcssStyleBranchProfile,
} from './branches'
export * from './compat'
export { createLocalUtilityOrderPlan, UNI_APP_X_LOCAL_UTILITY_MARKER } from './compat/uni-app-x/local-utility-order'
export {
  compileCssMacroConditionalComments,
  CSS_MACRO_STYLE_OPTIONS_MARKER,
  hasCssMacroStyleOptions,
  hasCssMacroTailwindV4CustomVariantConditionalComments,
  hasCssMacroTailwindV4Directive,
  hasCssMacroTailwindV4InternalAtRules,
  hasCssMacroTailwindV4Source,
  transformCssMacroCss,
  transformCssMacroTailwindV4Source,
  withCssMacroStyleOptions,
} from './css-macro/auto'
export { CSS_MACRO_POSTCSS_PLUGIN_NAME, default as cssMacroPostcssPlugin } from './css-macro/postcss'
// 统一导出入口，供外部调用端按需引用核心能力
export { collectRpxThemeVariables, inspectRpxCalcUsage, type RpxCalcUsage } from './diagnostics/rpx-theme'
export { fingerprintStyleOptions } from './fingerprint'
export { processFrameworkCss } from './framework-pipeline'
export {
  type PostcssFrameworkProfile,
  type PostcssFrameworkStrategy,
  type PostcssFrameworkType,
  type ResolvePostcssFrameworkOptions,
  resolvePostcssFrameworkProfile,
  resolvePostcssFrameworkStrategy,
  resolvePostcssStyleTarget,
} from './frameworks'
export {
  collectApplyOnlyCssSelectors,
  collectApplyOnlyCssSelectorsRoot,
  filterApplyOnlyGeneratedCss,
  filterApplyOnlyGeneratedCssRoot,
} from './generator-plugin/apply-only'
export { normalizeConfigDirective, prependConfigDirective, rewriteCssConfigRequests, stripTailwindConfigDirectives } from './generator-plugin/config-directive'
export {
  analyzeTailwindCssDirectives,
  isTailwindCssGenerationDirective,
  isTailwindCssImportAtRule,
  isTailwindCssImportRequest,
  isTailwindCssPackageJsonImportRequest,
  isWeappTailwindcssImportRequest,
  normalizeTailwindCssImportRequest,
  parseTailwindCssConfigRequest,
  parseTailwindCssDirectiveRequest,
  type TailwindCssDirectiveAnalysis,
  type TailwindCssDirectiveAnalysisOptions,
  type TailwindCssDirectiveOptions,
} from './generator-plugin/directives'
export {
  cleanLocalCssImportWrapperTailwindDirectives,
  cleanLocalCssImportWrapperTailwindDirectivesRoot,
  collectCssImportRequestsRoot,
  type CollectCssImportRequestsRootOptions,
  createCssSourceOrderAppend,
  isLocalCssImportRequest,
  isMiniProgramLocalCssImportRequest,
  isPureLocalCssImportWrapper,
  isPureLocalCssImportWrapperRoot,
  normalizeOutputImportRequest,
  prefixLocalCssImportsWithWebpackIgnoreRoot,
  removeMatchingLocalCssImports,
  removeMatchingLocalCssImportsRoot,
  removeTailwindSourceDirectivesRoot,
  removeUnsupportedMiniProgramCssImportsRoot,
  restoreLocalCssImports,
  type RewriteLocalCssImportRequestOptions,
  rewriteLocalCssImportRequestsForOutput,
  rewriteLocalCssImportRequestsForOutputRoot,
  splitLocalCssImports,
  splitLocalCssImportsRoot,
} from './generator-plugin/local-imports'

export * from './handler'
export { default as postcssHtmlTransform, type IOptions as PostcssHtmlTransformOptions } from './html-transform'
export {
  createStylePipeline,
  type PipelineNodeContext,
  type PipelineNodeCursor,
  type PipelineStage,
  type ResolvedPipelineNode,
  type StyleProcessingPipeline,
} from './pipeline'
export {
  applyConfiguredCssCalc,
  type ApplyConfiguredCssCalcOptions,
} from './plugins/applyConfiguredCssCalc'
export { applyConfiguredCssUnits, type ApplyConfiguredCssUnitsOptions } from './plugins/applyConfiguredCssUnits'
export { isWechatAutoCssCalc } from './plugins/auto-calc'
export { createFallbackPlaceholderReplacer } from './plugins/post/specificity-cleaner'

export {
  getPostcssPluginName,
  removeTailwindPostcssPlugins,
  resolveFilteredPostcssConfig,
  resolvePostcssConfig,
} from './postcss-config'
export { postcss } from './postcss-runtime'
export type {
  AcceptedPlugin,
  AtRule,
  ChildNode,
  Container,
  Declaration,
  Document,
  Helpers,
  Node,
  Plugin,
  PluginCreator,
  Node as PostcssNode,
  ProcessOptions,
  Processor,
  Result,
  Root,
  Rule,
} from './postcss-runtime'
export { createInjectPreflight } from './preflight'
export { selectorContainsPseudoClass } from './selectorParser/pseudo'

export { internalCssSelectorReplacer } from './shared'
export {
  collectCssInlineSourceCandidates,
  createSourceScanPattern,
  createTailwindSourceEntryMatcher,
  expandInlineSourceCandidatePattern,
  expandTailwindSourceEntries,
  FULL_SOURCE_SCAN_EXTENSION_RE,
  FULL_SOURCE_SCAN_EXTENSIONS,
  FULL_SOURCE_SCAN_PATTERN,
  isFileExcludedByTailwindSourceEntries,
  isFileMatchedByTailwindSourceEntries,
  normalizeLegacyContentEntries,
  parseConfigParam,
  parseSourceFileParam,
  resolveCssSourceEntries,
  resolveSourceScanPath,
  resolveTailwindSourceEntry,
  type TailwindInlineSourceCandidates,
  type TailwindSourceEntry,
  toPosixPath,
} from './source-scan'
export { collectCssApplyCandidates, collectGeneratorCssCandidates, collectRuntimeApplyCandidates } from './source-scan/candidates'
export { describeCssSources } from './source-scan/description'
export { type CssScanDefinition, type CssScanPolicy, resolveCssScanSources } from './source-scan/resolve'
export { analyzeTailwindV4EntrySource, type TailwindV4EntrySourceAnalysis } from './source-scan/tailwind-v4/entry-source'
export { analyzeTailwindV4Source } from './source-scan/tailwind-v4/fingerprint'
export {
  createPostcssStyleTargetProfile,
  type PostcssStyleTarget,
  type PostcssStyleTargetProfile,
} from './style-targets'
export {
  createCssRuntimeAffectingSignature,
  type CssImportSourceParam,
  type CssImportSpecifier,
  isTailwindCssImport,
  isUniAppXStyleSourceEmpty,
  parseCssImportSpecifier,
  parseCssSource,
  parseImportSourceParam,
  parseScssSource,
  parseUniAppXStyleSource,
  quoteCssImportSpecifier,
  scss,
  stringifyScssSource,
} from './syntax/index'
export { hasCssLocationDependencies } from './syntax/location-dependencies'
export { rewriteCssImportSpecifiers } from './syntax/rewrite-imports'

export { canProcessSourceStyleAsCss } from './syntax/source-style'
export * from './types'
export { analyzeCssCalcContext, type CssCalcContext } from './utils/css-calc-context'
export { isCssCalcCustomPropertySelected } from './utils/css-custom-property'
export { annotateCssTokenSources, type CssTokenSource, type CssTokenSourceMap } from './utils/css-source-trace'
export { collectCustomPropertyValues, mergeCustomPropertyValues } from './utils/custom-property-values'
export { createDeferredCssSourceMarker, readDeferredCssSourceMarkers, stripDeferredCssSourceMarkers } from './utils/deferred-css-source'
export { replaceViteGeneratedCssModule } from './utils/generated-css-marker'

export { type BundlerGeneratedCssMarkerBlock, createBundlerGeneratedCssEndMarker, createBundlerGeneratedCssMarker, hasBundlerGeneratedCssMarker, parseBundlerGeneratedCssMarkerBlocks, stripBundlerGeneratedCssMarkers } from './utils/generated-css-marker'
export {
  containsCssAfterMinify,
  createCssRuleMatcher,
  dedupeCoveredCssRules,
  filterExistingCssRules,
  mergeCoveredCssRuleDeclarations,
  mergeMiniProgramPreflightRuleDeclarations,
  mergeMiniProgramThemeScopeRuleDeclarations,
} from './vite-css-rules'

export {
  composeRules as unitConversionComposeRules,
  presets as unitConversionPresets,
} from 'postcss-rule-unit-converter'
