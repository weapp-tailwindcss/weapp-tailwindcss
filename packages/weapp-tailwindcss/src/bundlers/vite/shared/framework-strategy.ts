import type { OutputBundle } from 'rollup'
import type { ResolvedConfig } from 'vite'
import type { getCompilerContext } from '@/context'
import type { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import type { resolveGeneratorRuntimeBranch } from '@/runtime-branch'
import type { CreateJsHandlerOptions, InternalUserDefinedOptions } from '@/types'

export interface ViteFrameworkExtraPluginPlatform {
  isIosPlatform?: boolean | undefined
}

export interface ViteFrameworkRuntimeFeatureContext {
  uniAppX: ReturnType<typeof getCompilerContext>['uniAppX']
}

export interface ViteFrameworkCssPipelineContext {
  bundle?: OutputBundle | undefined
  currentGeneratorBranch: ReturnType<typeof resolveGeneratorRuntimeBranch>
  currentGeneratorOptions: ReturnType<typeof normalizeWeappTailwindcssGeneratorOptions>
  opts: InternalUserDefinedOptions
  resolvedConfig: ResolvedConfig | undefined
  resolveStylePlatform: () => string | undefined
}

export interface ViteFrameworkCssPipelineStrategy {
  getCssHandlerExtraOptions?: (context: ViteFrameworkCssPipelineContext & { file: string }) => Record<string, unknown>
  getServeJsHandlerOptions?: (context: ViteFrameworkCssPipelineContext & { file: string }) => CreateJsHandlerOptions | undefined
  includeTailwindGeneratedCssAssetsInRootCoverage?: (context: ViteFrameworkCssPipelineContext & {
    bundleFiles: string[]
    isWebGeneratorTarget: boolean
    outDir: string
  }) => boolean
  isHarmonyAppStyleTarget?: (context: ViteFrameworkCssPipelineContext) => boolean
  isNativeAppStyleTarget?: (context: ViteFrameworkCssPipelineContext) => boolean
  resolveConfiguredCssEntryRootInjectionTarget?: (context: ViteFrameworkCssPipelineContext & {
    bundle: OutputBundle
    isConfiguredCssEntryFile: (file: string | undefined) => boolean
    isMiniProgramStyleOutputFile: (file: string) => boolean
    isRootStyleOutputFile: (file: string) => boolean
    outputFile: string
    sourceFile: string | undefined
  }) => string | undefined
  shouldApplyFinalWebviewCssCompat?: (context: ViteFrameworkCssPipelineContext & {
    bundleFiles: string[]
    isWebGeneratorTarget: boolean
    outDir: string
  }) => boolean
  shouldApplyWebCssCompat?: (context: ViteFrameworkCssPipelineContext) => boolean
  shouldDeferEmptyScopedCssSource?: (context: ViteFrameworkCssPipelineContext & {
    cssHandlerOptions: { isMainChunk?: boolean | undefined }
    generatorCode: string
  }) => boolean
  shouldDeferPreTransformTailwindGeneration?: (context: ViteFrameworkCssPipelineContext & {
    code: string
    id: string
  }) => boolean
  shouldKeepRootMiniProgramStyleAsImportShell?: (context: ViteFrameworkCssPipelineContext & {
    css: string
    file: string
  }) => boolean
  shouldMoveRootMiniProgramStyleToImportShellOrigin?: (context: ViteFrameworkCssPipelineContext & {
    file: string
  }) => boolean
  shouldNormalizeRootMiniProgramImportShell?: (context: ViteFrameworkCssPipelineContext) => boolean
  shouldPreferExplicitWebCssTargets?: (context: ViteFrameworkCssPipelineContext & {
    explicitRootTargets: string[]
    explicitWebCssTargets: string[]
    file: string
  }) => boolean
  shouldPreferMatchedRootWebOutputTarget?: (context: ViteFrameworkCssPipelineContext & {
    file: string
    matchedRootWebOutputTargets: string[]
  }) => boolean
  shouldPreserveStyleOutputExtension?: (context: ViteFrameworkCssPipelineContext) => boolean
  shouldSelectConfiguredCssEntryRootSource?: (context: ViteFrameworkCssPipelineContext & {
    isRootStyleOutputFile: (file: string) => boolean
    outputFile: string
  }) => boolean
  shouldRemoveDuplicateUnlinkedRootCssAssetsReferencedByHtml?: (context: ViteFrameworkCssPipelineContext & {
    bundleFiles: string[]
    isWebGeneratorTarget: boolean
    outDir: string
  }) => boolean
  shouldTransformServeJs?: (context: ViteFrameworkCssPipelineContext) => boolean
  transformEmittedWebCss?: (css: string, context: ViteFrameworkCssPipelineContext) => string
  shouldRehashEmittedWebCssAsset?: (file: { fileName?: string, name?: string }) => boolean
  transformGeneratedCss?: (css: string, context: ViteFrameworkCssPipelineContext & {
    defaultWebCssCompat: (css: string) => string
    removeScopedPreflight: (css: string, options?: { preserveRuntimeProperties?: boolean }) => string
    shouldApplyWebCssCompat: boolean
  }) => string
}
