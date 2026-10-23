import type { ViteFrameworkCssPipelineContext, ViteFrameworkCssPipelineStrategy } from '../../shared/framework-strategy'
import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { resolveFrameworkEnvironment } from '@/framework-policies/environment-snapshot'
import { hasTailwindApplyDirective, hasTailwindRootDirectives } from '@/generation/directives'
import { createUniViteStyleInjector } from '@/style-injector/vite/uni'
import { hoistUniAppXBorderPreflight } from '@/uni-app-x/border-preflight'
import { isUniAppXHarmonyOutDir, isUniAppXNativeAppOutDir } from '@/uni-app-x/harmony'
import { isUniAppXHarmonyBundle } from '@/uni-app-x/style-asset'
import { createUniAppXPlugins } from '@/uni-app-x/vite'
import { resolveUniAppXCssTarget } from '@/uni-app-x/vite/style-request'
import { withUniAppXWebPreflightReset } from '@/uni-app-x/web-preflight-reset'
import { createViteFrameworkPlugins } from '../../shared/create-framework-plugins'
import { resolveUniAppXNativeCssHandlerOptions } from '../../uni-app-x-css-options'
import { cleanUrl } from '../../utils'
import { uniViteRuntimeStrategy } from '../shared/uni/runtime-strategy'
import { createUniAppXAssetPipeline } from './asset-pipeline'

function isUniAppXNativeAppStyleTarget(context: ViteFrameworkCssPipelineContext, platform: ReturnType<typeof resolveFrameworkEnvironment>['uniUtsPlatform']) {
  const stylePlatform = context?.resolveStylePlatform?.()
  return platform.isApp
    || stylePlatform === 'app'
    || stylePlatform === 'app-plus'
    || stylePlatform?.startsWith('app-') === true
    || isUniAppXNativeAppOutDir(context.outDir)
    || isUniAppXNativeAppOutDir(context.root)
}

function isUniAppXHarmonyAppStyleTarget(context: ViteFrameworkCssPipelineContext, uniUtsPlatform: ReturnType<typeof resolveFrameworkEnvironment>['uniUtsPlatform']) {
  const canInferHarmonyAppStyleTarget = !uniUtsPlatform.normalized || uniUtsPlatform.isApp
  return uniUtsPlatform.isAppHarmony || (
    canInferHarmonyAppStyleTarget
    && (
      (context.assets != null && isUniAppXHarmonyBundle(context.assets))
      || isUniAppXHarmonyOutDir(context.outDir)
    )
  )
}

export function createUniAppXCssPipelineStrategy(options: UserDefinedOptions | InternalUserDefinedOptions): ViteFrameworkCssPipelineStrategy {
  const platform = resolveFrameworkEnvironment(options).uniUtsPlatform
  return {
    sources: {
      shouldDeferPreTransformTailwindGeneration(context) {
        return resolveUniAppXCssTarget(context.id) === 'uvue'
          && hasTailwindApplyDirective(context.code)
          && !hasTailwindRootDirectives(context.code, { importFallback: true })
      },
    },
    generation: {
      getCssHandlerExtraOptions() {
        return resolveUniAppXNativeCssHandlerOptions(options)
      },
      isHarmonyAppStyleTarget(context) {
        return isUniAppXHarmonyAppStyleTarget(context, platform)
      },
      isNativeAppStyleTarget(context) {
        return isUniAppXNativeAppStyleTarget(context, platform)
      },
      shouldDeferEmptyScopedCssSource(context) {
        if (!context.cssHandlerOptions.isMainChunk && hasTailwindApplyDirective(context.generatorCode)) {
          return false
        }
        return true
      },
      transformGeneratedCss(css, context) {
        const webCss = context.shouldApplyWebCssCompat
          ? context.defaultWebCssCompat(css)
          : css
        const output = withUniAppXWebPreflightReset(
          context.removeScopedPreflight(webCss, { preserveRuntimeProperties: context.currentGeneratorBranch.isWeb }),
          context.currentGeneratorBranch.isWeb,
        )
        return context.currentGeneratorBranch.isWeb ? output : hoistUniAppXBorderPreflight(output)
      },
    },
    styles: {
      rootImportShell: 'preserve',
      shouldPreserveStyleOutputExtension(context) {
        return isUniAppXNativeAppStyleTarget(context, platform)
          || isUniAppXHarmonyAppStyleTarget(context, platform)
      },
    },
    assets: {
      transformEmittedWebCss(css, context) {
        if (!context.currentGeneratorBranch.isWeb || !/border-width\s*:\s*medium\b/i.test(css)) {
          return css
        }
        return withUniAppXWebPreflightReset(css, context.currentGeneratorBranch.isWeb)
      },
      shouldRehashEmittedWebCssAsset(file) {
        return typeof file.fileName === 'string' && file.fileName.endsWith('.css')
      },
    },
  }
}

export function createUniAppXVitePlugins(options: UserDefinedOptions | InternalUserDefinedOptions = {}) {
  return createViteFrameworkPlugins(options, {
    frameworkName: 'uni-app-x',
    createAssetPipeline: () => createUniAppXAssetPipeline(options),
    runtimeStrategy: {
      ...uniViteRuntimeStrategy,
      invalidateBeforeTransform: true,
      isRuntimeAffectingSource: (file, isWeb) => !isWeb && /\.(?:uvue|nvue)$/i.test(cleanUrl(file)),
    },
    adaptWatchCssBeforeFrameworkCache: true,
    cssPipelineStrategy: createUniAppXCssPipelineStrategy(options),
    styleInjectorDelegate: createUniViteStyleInjector,
    isRuntimeClassSetFeatureEnabled: () => true,
    sourceCandidatesBeforeExtraPlugin: plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue',
    createExtraPlugins: context => createUniAppXPlugins({
      appType: 'uni-app-x',
      cssPreflight: context.cssPreflight,
      cssPreflightRange: context.cssPreflightRange,
      customAttributesEntities: context.customAttributesEntities,
      disabledDefaultTemplateHandler: context.disabledDefaultTemplateHandler,
      ensureRuntimeClassSet: context.ensureRuntimeClassSet,
      generateCss: context.generateCss,
      getResolvedConfig: context.getResolvedConfig,
      hmrCssModuleVersions: context.hmrCssModuleVersions,
      beginSfcStyleUpdate: context.beginSfcStyleUpdate,
      isEnabled: context.isEnabled,
      uniUtsPlatform: resolveFrameworkEnvironment(options).uniUtsPlatform,
      isIosPlatform: resolveFrameworkEnvironment(options).uniUtsPlatform.isAppIos,
      isNativeAppStyleTarget: context.isNativeAppStyleTarget,
      isWebGeneratorTarget: context.isWebGeneratorTarget,
      jsHandler: context.transformJs,
      mainCssChunkMatcher: context.matchesMainCss,
      registerModuleGraphCandidates: context.registerModuleGraphCandidates,
      runtimeState: { get readyPromise() { return context.waitForRuntimeReady() } },
      styleHandler: context.transformStyle,
      syncSourceCandidatesForHotUpdate: context.syncSourceCandidatesForHotUpdate,
      tailwindRootCssModuleIds: context.tailwindRootCssModuleIds,
      ...(options.uniAppX === undefined ? {} : { uniAppX: options.uniAppX }),
      viteProcessedCssSourceFiles: context.viteProcessedCssSourceFiles,
      webCssEntryDiagnostics: context.webCssEntryDiagnostics,
    }),
  })
}
