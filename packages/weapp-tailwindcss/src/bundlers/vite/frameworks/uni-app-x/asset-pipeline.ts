import type { ViteFrameworkAssetPipelineStrategy, ViteFrameworkJsAssetContext } from '../../shared/framework-asset-strategy'
import type { CreateJsHandlerOptions, UserDefinedOptions } from '@/types'
import { hasCompiledBorderPreflight, injectCompiledBorderPreflight } from '@/uni-app-x/compiled-border-preflight'
import { isUniAppXEnabled } from '@/uni-app-x/options'
import { createUniAppXBundleAssetSourceGetter, injectUniAppXStylePlaceholder, UNI_APP_X_STYLE_PLACEHOLDER_VERSION } from '@/uni-app-x/style-asset'
import { applyHarmonyBundleStyles, createHarmonyBundleStyleSources, handleUniAppXPostCssTasks } from './postprocess'

function createJsAssetTask(context: ViteFrameworkJsAssetContext, options: Readonly<UserDefinedOptions>) {
  if (!options.uniAppX) {
    return
  }
  const handlerOptions: CreateJsHandlerOptions = {
    uniAppX: isUniAppXEnabled(options.uniAppX),
    babelParserOptions: { plugins: ['typescript'], sourceType: 'unambiguous' },
  }
  const getAssetSource = createUniAppXBundleAssetSourceGetter(context.assets)
  return async () => {
    if (context.shouldTransform && context.shouldSkipTransform(handlerOptions)) {
      return
    }
    await context.runCachedTransform({
      hashSalt: UNI_APP_X_STYLE_PLACEHOLDER_VERSION,
      async transform(source) {
        const result = await context.transformJs(source, handlerOptions)
        return {
          ...result,
          code: options.appType !== 'uni-app-x'
            ? injectUniAppXStylePlaceholder(context.file, result.code, getAssetSource)
            : result.code,
        }
      },
    })
  }
}

/** 每个框架实例捕获自己的配置；产物阶段的临时状态仅存于本轮回调。 */
export function createUniAppXAssetPipeline(options: Readonly<UserDefinedOptions>): ViteFrameworkAssetPipelineStrategy {
  return {
    prepareTemplateAsset(context) {
      if (context.styles.length !== 1 || !hasCompiledBorderPreflight(context.styles[0]!.source, options.cssPreflight)) {
        return
      }
      return {
        cacheKey: `uni-app-x:border-preflight:1:${options.cssPreflightRange ?? 'default'}`,
        transform: source => injectCompiledBorderPreflight(source, options.cssPreflightRange),
      }
    },
    createJsAssetTask: context => createJsAssetTask(context, options),
    async afterTransform(context) {
      const applyStyleSources = await handleUniAppXPostCssTasks({
        ...context,
        enabled: options.appType === 'uni-app-x' || context.isNativeAppStyleTarget || context.isHarmonyAppStyleTarget,
        deferStylePlaceholderInjection: options.appType === 'uni-app-x',
      })
      if (!context.isHarmonyAppStyleTarget || applyStyleSources.length === 0) {
        return
      }
      return () => {
        if (applyHarmonyBundleStyles(context, context.getProcessedCssSources())) {
          context.debug('uni-app-x harmony bundle styles inject after css assets')
        }
      }
    },
    async finalizeStyles(context) {
      if (!context.isHarmonyAppStyleTarget) {
        return
      }
      if (applyHarmonyBundleStyles(context, await createHarmonyBundleStyleSources(context))) {
        context.debug('uni-app-x harmony bundle styles inject')
      }
    },
  }
}
