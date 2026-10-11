import type { OutputBundle } from 'rollup'
import type { Plugin } from 'vite'
import type { CssFinalizerContext } from './options'
import path from 'node:path'
import process from 'node:process'
import { disposeCompilerOwner, finalizeCompilerShadowRun } from '@/compiler'
import { finalizeWebCssCalc } from './css-calc'
import { tryFinalizeGenericWebCss } from './generic-web-fast-path'

/**
 * Generic Web 专用 CSS finalizer。
 *
 * 该插件复用 CSS transform 阶段记录的 CSS asset，显式开启 cssCalc 时也处理
 * 最终资产中的普通 CSS；不扫描或改写 HTML、JavaScript、模板和小程序分包产物。
 */
export function createViteWebCssFinalizerOutputPlugin(context: CssFinalizerContext): Plugin {
  return {
    name: 'weapp-tailwindcss:adaptor:web-css-finalizer',
    enforce: 'post',
    async closeBundle() {
      if (context.getResolvedConfig()?.build?.watch != null) {
        return
      }
      await disposeCompilerOwner(context.runtimeState)
    },
    async closeWatcher() {
      await disposeCompilerOwner(context.runtimeState)
    },
    generateBundle: {
      order: 'post',
      async handler(_options, bundle: OutputBundle) {
        const resolvedConfig = context.getResolvedConfig()
        if (resolvedConfig?.command !== 'build') {
          return
        }
        const rootDir = resolvedConfig.root ? path.resolve(resolvedConfig.root) : process.cwd()
        const recordTiming = (phase: string, startedAt: number) => {
          context.hmrTimingRecorder?.record(`webCssFinalizer.${phase}`, performance.now() - startedAt)
        }
        const startedAt = performance.now()
        const finalized = tryFinalizeGenericWebCss({
          bundle,
          context,
          createCssPipelineContext: file => ({
            bundle,
            currentGeneratorBranch: {
              isWeb: true,
              isNativeApp: false,
              isMiniProgram: false,
            },
            currentGeneratorOptions: {
              target: 'web',
              enabled: true,
            },
            file,
            opts: context.opts,
            resolvedConfig,
            resolveStylePlatform: () => 'web',
          } as any),
          isHarmonyAppStyleTarget: false,
          isNativeAppStyleTarget: false,
          isWebGeneratorTarget: true,
          recordTiming,
          rootDir,
          sourceRoot: undefined,
        })
        if (!finalized) {
          context.debug('Generic Web CSS finalizer skipped: no unique processed CSS asset')
        }
        await finalizeWebCssCalc(bundle, context)
        finalizeCompilerShadowRun(context.runtimeState)
        context.hmrTimingRecorder?.record('webCssFinalizer.total', performance.now() - startedAt)
      },
    },
  }
}
