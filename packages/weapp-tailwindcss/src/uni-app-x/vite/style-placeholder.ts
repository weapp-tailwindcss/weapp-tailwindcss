import type { UniPlatformInfo } from '@weapp-tailwindcss/env'
import type { Plugin } from 'vite'
import type { resolveUniAppXOptions } from '../options'
import type { createUniAppXHarmonyApplyExpander } from './harmony-apply'
import type { CreateUniAppXPluginsOptions } from './plugin-options'
import path from 'node:path'
import process from 'node:process'
import {
  collectUniAppXHarmonyApplyStyleSources,
  collectUniAppXHarmonyApplyUtilities,
  createUniAppXBundleAssetSourceGetter,
  createUniAppXHarmonyApplyGeneratorSource,
  injectUniAppXHarmonyBundleStyles,
  injectUniAppXStylePlaceholder,
} from '../style-asset'

interface StylePlaceholderPluginOptions {
  isEnabled: () => boolean
  utsPlatform: Readonly<UniPlatformInfo>
  isNativeAppBuildTarget: (id?: string) => boolean
  isHarmonyBuildTarget: () => boolean
  getResolvedConfig: CreateUniAppXPluginsOptions['getResolvedConfig']
  generateCss: CreateUniAppXPluginsOptions['generateCss']
  harmonyApply: Pick<ReturnType<typeof createUniAppXHarmonyApplyExpander>, 'getSources'>
  componentMatcher: ReturnType<typeof resolveUniAppXOptions>['componentLocalStyles']['componentMatcher']
  shouldEnableComponentLocalStyle: () => boolean
}

/** 在 bundle 生命周期注入原生样式占位与当前 Harmony 来源，不读取源码文件。 */
export function createUniAppXStylePlaceholderPlugin(options: StylePlaceholderPluginOptions): Plugin {
  const {
    isEnabled,
    utsPlatform,
    isNativeAppBuildTarget,
    isHarmonyBuildTarget,
    getResolvedConfig,
    generateCss,
    harmonyApply,
    componentMatcher,
    shouldEnableComponentLocalStyle,
  } = options
  return {
    name: 'weapp-tailwindcss:uni-app-x:style-placeholder',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        if (!isEnabled()) {
          return
        }
        const currentUtsPlatform = utsPlatform
        const canInferHarmonyTarget = !currentUtsPlatform.normalized || currentUtsPlatform.isApp
        const isHarmonyTarget = currentUtsPlatform.isAppHarmony || (canInferHarmonyTarget && isHarmonyBuildTarget())
        if (!isNativeAppBuildTarget() && !isHarmonyTarget) {
          return
        }
        const getAssetSource = createUniAppXBundleAssetSourceGetter(bundle)
        if (isHarmonyTarget) {
          const cssSources: string[] = []
          const harmonySources = harmonyApply.getSources(this?.getModuleIds?.())
          // 空权威快照也是当前状态，不能用旧 chunk map 复活已经删除的样式。
          const applyStyleSources = harmonySources.hasSourceSnapshots
            ? [...harmonySources.sources]
            : collectUniAppXHarmonyApplyStyleSources(bundle)
          const applyUtilities = harmonySources.hasSourceSnapshots
            ? harmonySources.utilities
            : collectUniAppXHarmonyApplyUtilities(bundle)
          if (applyStyleSources.length > 0 && applyUtilities.size > 0) {
            const harmonyApplyCssFile = path.resolve(getResolvedConfig()?.root ?? process.cwd(), 'uni-app-x-harmony-apply.css')
            const generatedCss = await generateCss?.(
              harmonyApplyCssFile,
              createUniAppXHarmonyApplyGeneratorSource(applyStyleSources, applyUtilities),
              {
                addWatchFile: this?.addWatchFile?.bind(this),
                disableSourceScan: true,
                sourceCandidates: [],
                transient: true,
              },
            )
            if (typeof generatedCss === 'string' && generatedCss.trim().length > 0) {
              cssSources.push(generatedCss)
            }
          }
          injectUniAppXHarmonyBundleStyles(bundle, {
            cssSources,
            componentMatcher,
            excludeComponents: shouldEnableComponentLocalStyle(),
          })
        }
        for (const [file, item] of Object.entries(bundle)) {
          if (item.type !== 'asset' || !file.endsWith('.uvue.ts')) {
            continue
          }
          const currentSource = String(item.source)
          const nextSource = injectUniAppXStylePlaceholder(file, currentSource, getAssetSource)
          if (nextSource !== currentSource) {
            item.source = nextSource
          }
        }
      },
    },
  }
}
