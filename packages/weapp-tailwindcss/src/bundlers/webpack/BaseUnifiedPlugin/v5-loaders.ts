import type { TailwindV4CssSource } from '@weapp-tailwindcss/engine'
import type { Compiler } from 'webpack'
import type { WebpackCssSourceRegistration, WebpackGeneratedCssRegistration } from '../loaders/runtime-registry'
import type { WebpackCssImportRewriteExtension } from '../shared/css-import-rewrite'
import type { LoaderAnchorFinders } from '../shared/loader-anchors'
import type { TailwindRuntimeState } from '@/tailwindcss/runtime'
import type { AppType, InternalUserDefinedOptions } from '@/types'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { ensureCompilerOwnerActive, runCompilerOwnerActivity } from '@/compiler/compiler-owner-state'
import { pluginName } from '@/constants'
import { resolveContextGeneratorConfiguration } from '@/generator/context-options'
import { captureResolvedFrameworkPostcssOptions, collectFrameworkPostcssOptionsFromLoaderEntries } from '../../../generation/framework-postcss'
import { deleteWebpackLoaderRuntime, setWebpackLoaderRuntime } from '../loaders/runtime-registry'
import { createDefaultLoaderAnchorFinders, findCssPreprocessorIndex } from '../shared/loader-anchors'
import { hasLoaderEntry, isCssLikeModuleResource } from './shared'

interface SetupWebpackV5LoadersOptions {
  compiler: Compiler
  options: InternalUserDefinedOptions
  appType?: AppType | undefined
  weappTailwindcssPackageDir: string
  shouldRewriteCssImports: boolean
  runtimeLoaderPath?: string | undefined
  registerAutoCssSource?: ((source: TailwindV4CssSource) => Promise<void> | void) | undefined
  runtimeState: TailwindRuntimeState
  getClassSetInLoader: () => Promise<void>
  getRuntimeSetInLoader: () => Promise<Set<string>>
  markWebpackProcessedCssSource?: ((file: string) => void) | undefined
  markWebpackCssSourceModule?: ((file: string) => void) | undefined
  registerWebpackGeneratedCss?: ((source: WebpackGeneratedCssRegistration) => void) | undefined
  updateWebpackGeneratedCss?: ((source: { css: string, file: string }) => void) | undefined
  registerWebpackCssSourceFile?: ((source: WebpackCssSourceRegistration) => void) | undefined
  getRuntimeWatchDependencies: () => {
    files: ReadonlySet<string>
    contexts: ReadonlySet<string>
  }
  loaderAnchorFinders?: LoaderAnchorFinders | undefined
  cssImportRewrite?: WebpackCssImportRewriteExtension | undefined
  runtimeRegistryKey?: string | undefined
  debug: (format: string, ...args: unknown[]) => void
}

export function setupWebpackV5Loaders(options: SetupWebpackV5LoadersOptions) {
  const {
    compiler,
    options: compilerOptions,
    appType,
    weappTailwindcssPackageDir,
    shouldRewriteCssImports,
    runtimeLoaderPath,
    registerAutoCssSource,
    runtimeState,
    getClassSetInLoader,
    getRuntimeSetInLoader,
    markWebpackProcessedCssSource,
    markWebpackCssSourceModule,
    registerWebpackGeneratedCss,
    updateWebpackGeneratedCss,
    registerWebpackCssSourceFile,
    getRuntimeWatchDependencies,
    loaderAnchorFinders = createDefaultLoaderAnchorFinders(),
    cssImportRewrite,
    runtimeRegistryKey = `weapp-tailwindcss-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    debug,
  } = options
  const { options: generatorOptions } = resolveContextGeneratorConfiguration(compilerOptions, {
    appType: compilerOptions.appType,
    platform: compilerOptions.cssOptions?.platform ?? compilerOptions.platform,
    tailwindcssMajorVersion: runtimeState.tailwindRuntime.majorVersion,
    uniAppX: compilerOptions.uniAppX,
  })
  const generatorTarget = generatorOptions.target
  const generatorBranch = generatorOptions.branch

  if (shouldRewriteCssImports) {
    cssImportRewrite?.configureCompiler?.(compiler, weappTailwindcssPackageDir)
  }

  const runtimeClassSetLoader = runtimeLoaderPath
    ?? path.resolve(__dirname, './weapp-tw-runtime-classset-loader.cjs')
  const shouldInjectRuntimeClassSetLoader = !generatorBranch.isWeb
  const shouldInjectCssGenerationLoader = generatorOptions.enabled
    && runtimeState.tailwindRuntime.majorVersion === 4
    && (generatorTarget === 'web' || generatorTarget === 'weapp')
  const shouldInjectCssImportRewriteLoader = shouldRewriteCssImports
    || shouldInjectCssGenerationLoader
  const runtimeCssGenerationLoader = shouldInjectCssGenerationLoader
    ? path.resolve(__dirname, './weapp-tw-css-generation-loader.cjs')
    : undefined
  const runtimeCssImportRewriteLoader = shouldInjectCssImportRewriteLoader
    ? path.resolve(__dirname, './weapp-tw-css-import-rewrite-loader.cjs')
    : undefined
  const runtimeClassSetLoaderExists = fs.existsSync(runtimeClassSetLoader)
  const runtimeCssGenerationLoaderExists = runtimeCssGenerationLoader
    ? fs.existsSync(runtimeCssGenerationLoader)
    : false
  const runtimeCssImportRewriteLoaderExists = runtimeCssImportRewriteLoader
    ? fs.existsSync(runtimeCssImportRewriteLoader)
    : false
  const run = <T>(activity: () => T | Promise<T>) => runCompilerOwnerActivity(runtimeState, activity)
  const runtimeLoaderRewriteOptions = shouldInjectCssImportRewriteLoader || shouldInjectCssGenerationLoader
    ? {
        run,
        pkgDir: weappTailwindcssPackageDir,
        compilerOptions,
        runtimeState,
        ...(appType === undefined ? {} : { appType }),
        ...(registerAutoCssSource === undefined ? {} : { registerCssSource: registerAutoCssSource }),
        ...(registerWebpackCssSourceFile === undefined ? {} : { registerCssSourceFile: registerWebpackCssSourceFile }),
        getRuntimeSet: getRuntimeSetInLoader,
        ...(markWebpackProcessedCssSource === undefined ? {} : { markGeneratedCssSource: markWebpackProcessedCssSource }),
        ...(registerWebpackGeneratedCss === undefined ? {} : { registerGeneratedCss: registerWebpackGeneratedCss }),
      }
    : undefined
  const classSetLoaderOptions = {
    run,
    getClassSet: getClassSetInLoader,
    getWatchDependencies: getRuntimeWatchDependencies,
    ...(registerWebpackCssSourceFile === undefined ? {} : { registerCssSourceFile: registerWebpackCssSourceFile }),
    ...(updateWebpackGeneratedCss === undefined ? {} : { updateGeneratedCss: updateWebpackGeneratedCss }),
  }
  setWebpackLoaderRuntime(runtimeRegistryKey, {
    classSet: classSetLoaderOptions,
    ...(runtimeLoaderRewriteOptions === undefined ? {} : { cssImportRewrite: runtimeLoaderRewriteOptions }),
  }, compiler)
  const dispose = () => deleteWebpackLoaderRuntime(runtimeRegistryKey, compiler)
  try {
    const { findRewriteAnchor, findClassSetAnchor } = loaderAnchorFinders
    const cssImportRewriteLoaderOptions = runtimeLoaderRewriteOptions && shouldInjectCssImportRewriteLoader
      ? {
          // Rspeedy 的 ReactLynx CSS 规则在 loader hook 后不会执行动态插入的
          // generation loader，Lynx 背景规则由 rewrite loader 直接生成。
          generateCss: compilerOptions.platform === 'lynx',
          tailwindcssImportRewriteRuntimeKey: runtimeRegistryKey,
        }
      : undefined
    const cssGenerationLoaderOptions = runtimeLoaderRewriteOptions && shouldInjectCssGenerationLoader
      ? {
          tailwindcssImportRewriteRuntimeKey: runtimeRegistryKey,
        }
      : undefined

    if (runtimeCssImportRewriteLoader && shouldRewriteCssImports && cssImportRewriteLoaderOptions) {
      cssImportRewrite?.configureRules?.(compiler, runtimeCssImportRewriteLoader, cssImportRewriteLoaderOptions)
    }

    const createRuntimeClassSetLoaderEntry = () => ({
      loader: runtimeClassSetLoader,
      options: {
        weappTailwindcssRuntimeKey: runtimeRegistryKey,
      },
      ident: null,
      type: null,
    })
    const createCssImportRewriteLoaderEntry = () => {
      if (!runtimeCssImportRewriteLoader || !cssImportRewriteLoaderOptions) {
        return null
      }
      return {
        loader: runtimeCssImportRewriteLoader,
        options: cssImportRewriteLoaderOptions,
        ident: null,
        type: null,
      }
    }
    const createCssGenerationLoaderEntry = () => {
      if (!runtimeCssGenerationLoader || !cssGenerationLoaderOptions) {
        return null
      }
      return {
        loader: runtimeCssGenerationLoader,
        options: cssGenerationLoaderOptions,
        ident: null,
        type: null,
      }
    }

    const { NormalModule } = compiler.webpack

    compiler.hooks.compilation.tap(pluginName, (compilation) => {
      ensureCompilerOwnerActive(runtimeState)
      NormalModule.getCompilationHooks(compilation).loader.tap({ name: pluginName, stage: 100 }, (_loaderContext, module) => {
        ensureCompilerOwnerActive(runtimeState)
        const hasRuntimeLoader = runtimeClassSetLoaderExists
          || runtimeCssGenerationLoaderExists
          || runtimeCssImportRewriteLoaderExists
        if (!hasRuntimeLoader) {
          return
        }
        if (shouldRewriteCssImports) {
          cssImportRewrite?.configureLoader?.(_loaderContext, weappTailwindcssPackageDir)
        }
        const loaderEntries = module.loaders || []
        // ReactLynx 为同一 CSS 模块创建 main-thread/background 两条规则。
        // main-thread 由 ignore-css-loader 丢弃，不能让它提前消费 Tailwind 源。
        const isLynxMainThreadCss = compilerOptions.platform === 'lynx'
          && (
            (module as unknown as { layer?: string }).layer === 'react:main-thread'
            || loaderEntries.some((entry: any) => entry.loader?.includes?.('ignore-css-loader'))
          )
        let rewriteAnchorIdx = findRewriteAnchor(loaderEntries)
        const classSetAnchorIdx = findClassSetAnchor(loaderEntries)
        const isCssModule = isCssLikeModuleResource(module.resource, compilerOptions.cssMatcher)
        if (isCssModule) {
          const frameworkPostcssOptions = collectFrameworkPostcssOptionsFromLoaderEntries(loaderEntries, _loaderContext)
          if (frameworkPostcssOptions) {
            captureResolvedFrameworkPostcssOptions(compilerOptions, frameworkPostcssOptions)
          }
        }
        if (isCssModule && typeof module.resource === 'string') {
          markWebpackCssSourceModule?.(module.resource)
        }
        if (process.env['WEAPP_TW_LOADER_DEBUG'] && isCssModule) {
          debug('loader hook css module: %s layer=%s loaders=%o anchors=%o', module.resource, (module as any).layer, loaderEntries.map((x: any) => x.loader), { rewriteAnchorIdx, classSetAnchorIdx })
        }
        if (process.env['WEAPP_TW_LOADER_DEBUG'] && typeof module.resource === 'string' && module.resource.endsWith('.css')) {
          debug('css module seen: %s loaders=%o anchors=%o', module.resource, loaderEntries.map((x: any) => x.loader), { rewriteAnchorIdx, classSetAnchorIdx })
        }
        if (rewriteAnchorIdx === -1 && classSetAnchorIdx === -1 && !isCssModule) {
          return
        }
        const preprocessorIndex = findCssPreprocessorIndex(loaderEntries)
        const anchorlessInsert = (entry: any, position: 'before' | 'after') => {
          if (position === 'after') {
            // 没有 CSS 消费 loader 时，仍要等预处理器把 SCSS/Less 编译成 CSS。
            loaderEntries.splice(preprocessorIndex === -1 ? loaderEntries.length : preprocessorIndex, 0, entry)
          }
          else {
            loaderEntries.unshift(entry)
          }
        }
        if (
          cssGenerationLoaderOptions
          && runtimeCssGenerationLoaderExists
          && runtimeCssGenerationLoader
          && isCssModule
          && !isLynxMainThreadCss
          && !hasLoaderEntry(loaderEntries, runtimeCssGenerationLoader)
        ) {
          const generationLoaderEntry = createCssGenerationLoaderEntry()
          const anchorIndex = findRewriteAnchor(loaderEntries)
          if (generationLoaderEntry) {
            if (anchorIndex === -1) {
              anchorlessInsert(generationLoaderEntry, 'after')
            }
            else {
              loaderEntries.splice(anchorIndex + 1, 0, generationLoaderEntry)
            }
          }
        }
        if (
          cssImportRewriteLoaderOptions
          && runtimeCssImportRewriteLoaderExists
          && runtimeCssImportRewriteLoader
          && isCssModule
          && !isLynxMainThreadCss
        ) {
          const existingIndex = loaderEntries.findIndex(entry => entry.loader?.includes?.(runtimeCssImportRewriteLoader))
          const existingOptions = existingIndex === -1 ? undefined : loaderEntries[existingIndex]?.options
          const generateInRegisteredLoader = typeof existingOptions === 'object' && existingOptions !== null
            && 'generateCss' in existingOptions && existingOptions['generateCss'] === true
          const rewriteLoaderEntry = existingIndex !== -1
            ? {
                ...loaderEntries.splice(existingIndex, 1)[0],
                loader: runtimeCssImportRewriteLoader,
                options: {
                  ...cssImportRewriteLoaderOptions,
                  generateCss: cssImportRewriteLoaderOptions.generateCss || generateInRegisteredLoader,
                },
              }
            : createCssImportRewriteLoaderEntry()
          if (rewriteLoaderEntry) {
            // Keep rewrite loader just after the anchor (executes before it).
            const anchorIndex = findRewriteAnchor(loaderEntries)
            if (anchorIndex === -1) {
              anchorlessInsert(rewriteLoaderEntry, 'after')
            }
            else {
              loaderEntries.splice(anchorIndex + 1, 0, rewriteLoaderEntry)
            }
            rewriteAnchorIdx = findRewriteAnchor(loaderEntries)
          }
        }
        if (
          shouldInjectRuntimeClassSetLoader
          && runtimeClassSetLoaderExists
          && !hasLoaderEntry(loaderEntries, runtimeClassSetLoader)
        ) {
          const classSetLoaderEntry = createRuntimeClassSetLoaderEntry()
          const anchorIndex = findClassSetAnchor(loaderEntries)
          if (anchorIndex === -1) {
            anchorlessInsert(classSetLoaderEntry, 'before')
          }
          else {
            const insertIndex = anchorIndex === -1 ? rewriteAnchorIdx : anchorIndex
            loaderEntries.splice(insertIndex, 0, classSetLoaderEntry)
          }
        }
      })
    })
  }
  catch (error) {
    dispose()
    throw error
  }
  return dispose
}
