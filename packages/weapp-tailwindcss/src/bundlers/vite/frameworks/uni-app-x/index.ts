import type { ViteFrameworkCssPipelineStrategy } from '../../shared/framework-strategy'
import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { hasTailwindApplyDirective, hasTailwindRootDirectives } from '@/generation/directives'
import { viteStyleInjectorDelegates } from '@/style-injector/internal'
import { hoistUniAppXBorderPreflight } from '@/uni-app-x/border-preflight'
import { isUniAppXHarmonyOutDir, isUniAppXNativeAppOutDir } from '@/uni-app-x/harmony'
import { isUniAppXHarmonyBundle } from '@/uni-app-x/style-asset'
import { createUniAppXPlugins } from '@/uni-app-x/vite'
import { resolveUniAppXCssTarget } from '@/uni-app-x/vite/style-request'
import { withUniAppXWebPreflightReset } from '@/uni-app-x/web-preflight-reset'
import { resolveUniUtsPlatform } from '@/utils'
import { createViteFrameworkPlugins } from '../../shared/create-framework-plugins'
import { resolveUniAppXNativeCssHandlerOptions } from '../../uni-app-x-css-options'

function isUniAppXNativeAppStyleTarget(context?: Parameters<NonNullable<ViteFrameworkCssPipelineStrategy['isNativeAppStyleTarget']>>[0]) {
  const stylePlatform = context?.resolveStylePlatform?.()
  return resolveUniUtsPlatform().isApp
    || stylePlatform === 'app'
    || stylePlatform === 'app-plus'
    || stylePlatform?.startsWith('app-') === true
    || isUniAppXNativeAppOutDir(context?.resolvedConfig?.build?.outDir)
    || isUniAppXNativeAppOutDir(context?.resolvedConfig?.root)
}

function isUniAppXHarmonyAppStyleTarget(context: Parameters<NonNullable<ViteFrameworkCssPipelineStrategy['isHarmonyAppStyleTarget']>>[0]) {
  const uniUtsPlatform = resolveUniUtsPlatform()
  const canInferHarmonyAppStyleTarget = !uniUtsPlatform.normalized || uniUtsPlatform.isApp
  return uniUtsPlatform.isAppHarmony || (
    canInferHarmonyAppStyleTarget
    && (
      (context.bundle != null && isUniAppXHarmonyBundle(context.bundle))
      || isUniAppXHarmonyOutDir(context.resolvedConfig?.build?.outDir)
    )
  )
}

export const uniAppXCssPipelineStrategy: ViteFrameworkCssPipelineStrategy = {
  getCssHandlerExtraOptions(context) {
    return resolveUniAppXNativeCssHandlerOptions(context.opts)
  },
  isNativeAppStyleTarget(context) {
    return isUniAppXNativeAppStyleTarget(context)
  },
  isHarmonyAppStyleTarget(context) {
    return isUniAppXHarmonyAppStyleTarget(context)
  },
  shouldPreserveStyleOutputExtension(context) {
    return isUniAppXNativeAppStyleTarget(context)
      || isUniAppXHarmonyAppStyleTarget(context)
  },
  shouldKeepRootMiniProgramStyleAsImportShell() {
    return true
  },
  shouldDeferEmptyScopedCssSource(context) {
    if (!context.cssHandlerOptions.isMainChunk && hasTailwindApplyDirective(context.generatorCode)) {
      return false
    }
    return true
  },
  shouldDeferPreTransformTailwindGeneration(context) {
    return resolveUniAppXCssTarget(context.id) === 'uvue'
      && hasTailwindApplyDirective(context.code)
      && !hasTailwindRootDirectives(context.code, { importFallback: true })
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
  transformEmittedWebCss(css, context) {
    if (!context.currentGeneratorBranch.isWeb || !/border-width\s*:\s*medium\b/i.test(css)) {
      return css
    }
    return withUniAppXWebPreflightReset(css, context.currentGeneratorBranch.isWeb)
  },
  shouldRehashEmittedWebCssAsset(file) {
    return typeof file.fileName === 'string' && file.fileName.endsWith('.css')
  },
}

export function createUniAppXVitePlugins(options: UserDefinedOptions | InternalUserDefinedOptions = {}) {
  return createViteFrameworkPlugins(options, {
    frameworkName: 'uni-app-x',
    adaptWatchCssBeforeFrameworkCache: true,
    cssPipelineStrategy: uniAppXCssPipelineStrategy,
    getExtraPluginPlatform: () => ({
      isIosPlatform: resolveUniUtsPlatform().isAppIos,
    }),
    styleInjectorDelegate: viteStyleInjectorDelegates.uniApp,
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
      isEnabled: context.isEnabled,
      isIosPlatform: context.isIosPlatform,
      isNativeAppStyleTarget: context.isNativeAppStyleTarget,
      isWebGeneratorTarget: context.isWebGeneratorTarget,
      jsHandler: context.jsHandler,
      mainCssChunkMatcher: context.mainCssChunkMatcher,
      registerModuleGraphCandidates: context.registerModuleGraphCandidates,
      runtimeState: context.runtimeState,
      styleHandler: context.styleHandler,
      syncSourceCandidatesForHotUpdate: context.syncSourceCandidatesForHotUpdate,
      tailwindRootCssModuleIds: context.tailwindRootCssModuleIds,
      uniAppX: context.uniAppX,
      viteProcessedCssSourceFiles: context.viteProcessedCssSourceFiles,
      webCssEntryDiagnostics: context.webCssEntryDiagnostics,
    }),
  })
}
