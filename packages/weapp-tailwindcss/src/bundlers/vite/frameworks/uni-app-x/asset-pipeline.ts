import type { ViteFrameworkAssetPipelineStrategy, ViteFrameworkJsAssetContext } from '../../shared/framework-asset-strategy'
import type { UserDefinedOptions } from '@/types'
import path from 'node:path'
import { isUniAppXEnabled } from '@/uni-app-x/options'
import { createUniAppXBundleAssetSourceGetter, injectUniAppXHarmonyBundleStyles, UNI_APP_X_STYLE_PLACEHOLDER_VERSION } from '@/uni-app-x/style-asset'
import { createUniAppXAssetTask } from '@/uni-app-x/vite'
import { shouldSkipViteJsTransform } from '../../js-precheck'
import { createHarmonyBundleStyleSources, handleUniAppXPostCssTasks } from './postprocess'

function createJsAssetTask(context: ViteFrameworkJsAssetContext, options: Readonly<UserDefinedOptions>) {
  if (!options.uniAppX) {
    return
  }
  const { file, asset, outDir } = context
  const factory = createUniAppXAssetTask(file, asset, outDir, {
    cache: context.cache,
    hashKey: context.hashKey,
    hashSalt: `${context.hashSalt}:${UNI_APP_X_STYLE_PLACEHOLDER_VERSION}`,
    createHandlerOptions: context.createHandlerOptions,
    debug: context.debug,
    getAssetSource: createUniAppXBundleAssetSourceGetter(context.bundle),
    injectStylePlaceholder: options.appType !== 'uni-app-x',
    jsHandler: context.jsHandler,
    onUpdate: context.onUpdate,
    runtimeSet: context.runtimeSet,
    applyLinkedResults: context.applyLinkedResults,
    uniAppX: options.uniAppX,
  })
  return async () => {
    if (!context.shouldTransform) {
      context.debug('js skip transform (clean, uni-app-x), replay cache: %s', file)
      await factory()
      return
    }
    const handlerOptions = context.createHandlerOptions(path.resolve(outDir, file), {
      uniAppX: isUniAppXEnabled(options.uniAppX),
      babelParserOptions: { plugins: ['typescript'], sourceType: 'unambiguous' },
    })
    if (!context.disableJsPrecheck && shouldSkipViteJsTransform(context.source, handlerOptions)) {
      return
    }
    await factory()
  }
}

/** 每个框架实例捕获自己的配置；产物阶段的临时状态仅存于本轮回调。 */
export function createUniAppXAssetPipeline(options: Readonly<UserDefinedOptions>): ViteFrameworkAssetPipelineStrategy {
  return {
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
        if (injectUniAppXHarmonyBundleStyles(context.bundle, { cssSources: context.getProcessedCssSources() })) {
          context.debug('uni-app-x harmony bundle styles inject after css assets')
        }
      }
    },
    async finalizeStyles(context) {
      if (!context.isHarmonyAppStyleTarget) {
        return
      }
      if (injectUniAppXHarmonyBundleStyles(context.bundle, { cssSources: await createHarmonyBundleStyleSources(context) })) {
        context.debug('uni-app-x harmony bundle styles inject')
      }
    },
  }
}
