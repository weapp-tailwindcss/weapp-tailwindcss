import type { FrameworkAssets } from './framework-assets'
import type { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import type { resolveGeneratorRuntimeBranch } from '@/runtime-branch'
import type { CreateJsHandlerOptions, IStyleHandlerOptions } from '@/types'

/** 框架仅接收生成决策、构建位置与匹配操作。 */
export interface ViteFrameworkCssPipelineContext {
  readonly assets?: FrameworkAssets | undefined
  readonly currentGeneratorBranch: Readonly<ReturnType<typeof resolveGeneratorRuntimeBranch>>
  readonly currentGeneratorOptions: Readonly<ReturnType<typeof normalizeWeappTailwindcssGeneratorOptions>>
  readonly root: string | undefined
  readonly outDir: string | undefined
  readonly escapeMap: Readonly<Record<string, string>>
  readonly matchesCss: (file: string) => boolean
  readonly matchesMainCss: (file: string) => boolean
  readonly resolveStylePlatform: () => string | undefined
}

export interface ViteFrameworkSourcesStrategy {
  getServeJsHandlerOptions?: (context: ViteFrameworkCssPipelineContext & { file: string }) => CreateJsHandlerOptions | undefined
  shouldDeferPreTransformTailwindGeneration?: (context: ViteFrameworkCssPipelineContext & {
    code: string
    id: string
  }) => boolean
  shouldTransformServeJs?: (context: ViteFrameworkCssPipelineContext) => boolean
}

export interface ViteFrameworkGenerationStrategy {
  getCssHandlerExtraOptions?: (context: ViteFrameworkCssPipelineContext & { file: string }) => Partial<IStyleHandlerOptions>
  isHarmonyAppStyleTarget?: (context: ViteFrameworkCssPipelineContext) => boolean
  isNativeAppStyleTarget?: (context: ViteFrameworkCssPipelineContext) => boolean
  shouldApplyWebCssCompat?: (context: ViteFrameworkCssPipelineContext) => boolean
  shouldDeferEmptyScopedCssSource?: (context: ViteFrameworkCssPipelineContext & {
    cssHandlerOptions: { isMainChunk?: boolean | undefined }
    generatorCode: string
  }) => boolean
  transformGeneratedCss?: (css: string, context: ViteFrameworkCssPipelineContext & {
    defaultWebCssCompat: (css: string) => string
    removeScopedPreflight: (css: string, options?: { preserveRuntimeProperties?: boolean }) => string
    shouldApplyWebCssCompat: boolean
  }) => string
}

export interface ViteFrameworkStylesStrategy {
  readonly rootImportShell?: 'preserve' | 'extract'
  readonly preferExplicitWebTargets?: boolean
  readonly preferMatchedRootWebTarget?: boolean
  includeTailwindGeneratedCssAssetsInRootCoverage?: (context: ViteFrameworkCssPipelineContext & {
    bundleFiles: string[]
    isWebGeneratorTarget: boolean
    outDir: string
  }) => boolean
  resolveConfiguredCssEntryRootInjectionTarget?: (context: ViteFrameworkCssPipelineContext & {
    assets: FrameworkAssets
    isConfiguredCssEntryFile: (file: string | undefined) => boolean
    isMiniProgramStyleOutputFile: (file: string) => boolean
    isRootStyleOutputFile: (file: string) => boolean
    outputFile: string
    sourceFile: string | undefined
  }) => string | undefined
  shouldPreserveStyleOutputExtension?: (context: ViteFrameworkCssPipelineContext) => boolean
  shouldSelectConfiguredCssEntryRootSource?: (context: ViteFrameworkCssPipelineContext & {
    isRootStyleOutputFile: (file: string) => boolean
    outputFile: string
  }) => boolean
}

export interface ViteFrameworkAssetsStrategy {
  shouldApplyFinalWebviewCssCompat?: (context: ViteFrameworkCssPipelineContext & {
    bundleFiles: string[]
    isWebGeneratorTarget: boolean
    outDir: string
  }) => boolean
  shouldRemoveDuplicateUnlinkedRootCssAssetsReferencedByHtml?: (context: ViteFrameworkCssPipelineContext & {
    bundleFiles: string[]
    isWebGeneratorTarget: boolean
    outDir: string
  }) => boolean
  transformEmittedWebCss?: (css: string, context: ViteFrameworkCssPipelineContext) => string
  shouldRehashEmittedWebCssAsset?: (file: { fileName?: string, name?: string }) => boolean
}

export interface ViteFrameworkCssPipelineStrategy {
  readonly sources?: ViteFrameworkSourcesStrategy
  readonly generation?: ViteFrameworkGenerationStrategy
  readonly styles?: ViteFrameworkStylesStrategy
  readonly assets?: ViteFrameworkAssetsStrategy
}
