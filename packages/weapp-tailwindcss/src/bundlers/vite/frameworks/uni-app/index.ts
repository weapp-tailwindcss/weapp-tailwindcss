import type { ViteFrameworkCssPipelineStrategy } from '../../shared/framework-strategy'
import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import path from 'node:path'
import { transformWebCssSafeSelectors } from '@weapp-tailwindcss/postcss/transform'
import { createUniAppViteStyleInjector } from '@/style-injector/vite/uni-app'
import { createViteFrameworkPlugins } from '../../shared/create-framework-plugins'
import { uniViteRuntimeStrategy } from '../shared/uni/runtime-strategy'

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
  sources: {
    getServeJsHandlerOptions(context) {
      return isUniAppWebviewStylePlatform(context.resolveStylePlatform())
        ? { needEscaped: true }
        : undefined
    },
    shouldTransformServeJs(context) {
      return !context.currentGeneratorBranch.isWeb
        || isUniAppWebviewStylePlatform(context.resolveStylePlatform())
    },
  },
  generation: {
    shouldApplyWebCssCompat(context) {
      return isUniAppWebviewStylePlatform(context.resolveStylePlatform())
    },
    transformGeneratedCss(css, context) {
      const webCss = context.shouldApplyWebCssCompat
        ? context.defaultWebCssCompat(css)
        : css
      const safeCss = isUniAppWebviewStylePlatform(context.resolveStylePlatform())
        ? transformWebCssSafeSelectors(webCss, { escapeMap: context.escapeMap })
        : webCss
      return context.removeScopedPreflight(safeCss)
    },
  },
  styles: {
    rootImportShell: 'preserve',
    preferExplicitWebTargets: true,
    preferMatchedRootWebTarget: true,
    includeTailwindGeneratedCssAssetsInRootCoverage(context) {
      return context.isWebGeneratorTarget && isUniAppWebviewAppBundle(context.bundleFiles)
    },
    resolveConfiguredCssEntryRootInjectionTarget(context) {
      if (context.isMiniProgramStyleOutputFile(context.outputFile) || !context.isConfiguredCssEntryFile(context.sourceFile)) {
        return
      }
      const rootCssFiles: string[] = []
      const matchedRootCssFiles: string[] = []
      for (const [bundleFile, output] of Object.entries(context.assets)) {
        if (output.type !== 'asset') {
          continue
        }
        const file = output.fileName || bundleFile
        if (
          !context.matchesCss(file)
          || !context.isRootStyleOutputFile(file)
          || context.isMiniProgramStyleOutputFile(file)
        ) {
          continue
        }
        rootCssFiles.push(file)
        if (context.matchesMainCss(file)) {
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
    shouldSelectConfiguredCssEntryRootSource(context) {
      return context.matchesCss(context.outputFile)
        && context.isRootStyleOutputFile(context.outputFile)
    },
  },
  assets: {
    shouldApplyFinalWebviewCssCompat(context) {
      return isUniAppWebviewAppBundle(context.bundleFiles)
        || isUniAppWebviewOutDir(context.outDir)
    },
    shouldRemoveDuplicateUnlinkedRootCssAssetsReferencedByHtml(context) {
      return context.isWebGeneratorTarget && isUniAppWebviewAppBundle(context.bundleFiles)
    },
  },
}

export function createUniAppVitePlugins(options: UserDefinedOptions | InternalUserDefinedOptions = {}) {
  return createViteFrameworkPlugins(options, {
    frameworkName: 'uni-app',
    runtimeStrategy: uniViteRuntimeStrategy,
    adaptWatchCssBeforeFrameworkCache: true,
    cssPipelineStrategy: uniAppCssPipelineStrategy,
    styleInjectorDelegate: createUniAppViteStyleInjector,
  })
}
