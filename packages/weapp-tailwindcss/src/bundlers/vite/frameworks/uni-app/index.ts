import type { ViteFrameworkCssPipelineStrategy } from '../../shared/framework-strategy'
import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import path from 'node:path'
import { transformWebCssSafeSelectors } from '@weapp-tailwindcss/postcss/transform'
import { viteStyleInjectorDelegates } from '@/style-injector/internal'
import { createViteFrameworkPlugins } from '../../shared/create-framework-plugins'

function isUniAppWebviewStylePlatform(platform: string | undefined) {
  return platform === 'app' || platform === 'app-plus'
}

function isUniAppWebviewAppBundle(bundleFiles: string[]) {
  return bundleFiles.some(file => path.basename(file.replace(/[?#].*$/, '')) === 'app-service.js')
}

function isUniAppWebviewOutDir(outDir: string | undefined) {
  const normalized = outDir ? path.basename(path.normalize(outDir)).trim().toLowerCase() : undefined
  return normalized === 'app' || normalized === 'app-plus'
}

export const uniAppCssPipelineStrategy: ViteFrameworkCssPipelineStrategy = {
  getServeJsHandlerOptions(context) {
    return isUniAppWebviewStylePlatform(context.resolveStylePlatform())
      ? { needEscaped: true }
      : undefined
  },
  shouldApplyWebCssCompat(context) {
    return isUniAppWebviewStylePlatform(context.resolveStylePlatform())
  },
  includeTailwindGeneratedCssAssetsInRootCoverage(context) {
    return context.isWebGeneratorTarget && isUniAppWebviewAppBundle(context.bundleFiles)
  },
  resolveConfiguredCssEntryRootInjectionTarget(context) {
    if (context.isMiniProgramStyleOutputFile(context.outputFile) || !context.isConfiguredCssEntryFile(context.sourceFile)) {
      return
    }
    const rootCssFiles: string[] = []
    const matchedRootCssFiles: string[] = []
    for (const [bundleFile, output] of Object.entries(context.bundle)) {
      if (output.type !== 'asset') {
        continue
      }
      const file = output.fileName || bundleFile
      if (
        !context.opts.cssMatcher(file)
        || !context.isRootStyleOutputFile(file)
        || context.isMiniProgramStyleOutputFile(file)
      ) {
        continue
      }
      rootCssFiles.push(file)
      if (context.opts.mainCssChunkMatcher(file, context.opts.appType)) {
        matchedRootCssFiles.push(file)
      }
    }
    if (matchedRootCssFiles.length === 1) {
      return matchedRootCssFiles[0]
    }
    if (matchedRootCssFiles.length > 1) {
      return
    }
    return rootCssFiles.length === 1 ? rootCssFiles[0] : undefined
  },
  shouldApplyFinalWebviewCssCompat(context) {
    return isUniAppWebviewAppBundle(context.bundleFiles)
      || isUniAppWebviewOutDir(context.outDir)
  },
  shouldKeepRootMiniProgramStyleAsImportShell() {
    return true
  },
  shouldPreferExplicitWebCssTargets() {
    return true
  },
  shouldPreferMatchedRootWebOutputTarget() {
    return true
  },
  shouldRemoveDuplicateUnlinkedRootCssAssetsReferencedByHtml(context) {
    return context.isWebGeneratorTarget && isUniAppWebviewAppBundle(context.bundleFiles)
  },
  shouldSelectConfiguredCssEntryRootSource(context) {
    return context.opts.cssMatcher(context.outputFile)
      && context.isRootStyleOutputFile(context.outputFile)
  },
  shouldTransformServeJs(context) {
    return !context.currentGeneratorBranch.isWeb
      || isUniAppWebviewStylePlatform(context.resolveStylePlatform())
  },
  transformGeneratedCss(css, context) {
    const webCss = context.shouldApplyWebCssCompat
      ? context.defaultWebCssCompat(css)
      : css
    const safeCss = isUniAppWebviewStylePlatform(context.resolveStylePlatform())
      ? transformWebCssSafeSelectors(webCss, { escapeMap: context.opts.escapeMap })
      : webCss
    return context.removeScopedPreflight(safeCss)
  },
}

export function createUniAppVitePlugins(options: UserDefinedOptions | InternalUserDefinedOptions = {}) {
  return createViteFrameworkPlugins(options, {
    frameworkName: 'uni-app',
    adaptWatchCssBeforeFrameworkCache: true,
    cssPipelineStrategy: uniAppCssPipelineStrategy,
    styleInjectorDelegate: viteStyleInjectorDelegates.uniApp,
  })
}
