import type { SourceDescription } from 'rollup'
import type { Plugin } from 'vite'
import type { CreateUniAppXPluginsOptions } from './vite/plugin-options'
import path from 'node:path'
import process from 'node:process'
import {
  normalizeUniAppXImportantApplyForSass,
  postcss,
  restoreUniAppXImportantApplyMarker,
} from '@weapp-tailwindcss/postcss/transform'
import { extractSfcStyleBlocks } from '@/bundlers/vite/generate-bundle/sfc-style-source'
import { parseVueRequest } from '@/bundlers/vite/query'
import { cleanUrl, isCSSRequest } from '@/bundlers/vite/utils'
import { hasTailwindApplyDirective, hasTailwindRootDirectives } from '@/generation/directives'
import { isUniAppXHarmonyOutDir } from '@/uni-app-x/harmony'
import { shouldEnablePageLocalStyle as isPageLocalStyleFile } from '@/uni-app-x/local-style-matcher'
import { resolveUniUtsPlatform } from '@/utils'
import { omitUndefined } from '@/utils/object'
import { resolveUniAppXBorderPreflightOptions } from './border-preflight'
import { resolveUniAppXOptions } from './options'
import {
  collectUniAppXHarmonyApplyStyleSources,
  collectUniAppXHarmonyApplyUtilities,
  createUniAppXBundleAssetSourceGetter,
  createUniAppXHarmonyApplyGeneratorSource,
  injectUniAppXHarmonyBundleStyles,
  injectUniAppXStylePlaceholder,
} from './style-asset'
import { resolveUniAppXStyleIsolationEnabled } from './style-isolation'
import { retainUniAppXAuthorApplyCss } from './vite/author-apply'
import { createUniAppXHarmonyApplyExpander } from './vite/harmony-apply'
import { createUniAppXNativeHmrReloader } from './vite/native-hmr'
import { createUniAppXNativeBuildTargetResolver } from './vite/native-target'
import { isCssModuleExport, normalizeRelativeTailwindReferences, reportStyleWarnings, resolvePreprocessorTransform, resolveUniAppXCssTarget } from './vite/style-request'
import { createUniAppXStyleResult } from './vite/style-result'
import { createUniAppXSfcStyleSources, resolveUniAppXStyleSource } from './vite/style-source'
import { createUniAppXWebLocalStyleBridge } from './vite/web-local-style'
import { createUniAppXWebSfcHmr } from './vite/web-sfc-hmr'

export { createUniAppXAssetTask } from './vite/asset-task'

type TransformUVue = typeof import('./transform')['transformUVue']
let transformUVuePromise: Promise<TransformUVue> | undefined
function loadTransformUVue(): Promise<TransformUVue> {
  transformUVuePromise ??= import('./transform').then(mod => mod.transformUVue)
  return transformUVuePromise
}
const UVUE_NVUE_QUERY_RE = /\.(?:uvue|nvue)(?:\?.*)?$/
const UVUE_NVUE_RE = /\.(?:uvue|nvue)$/
export function createUniAppXPlugins(options: CreateUniAppXPluginsOptions): Plugin[] {
  const {
    appType,
    customAttributesEntities,
    disabledDefaultTemplateHandler,
    isIosPlatform: providedIosPlatform,
    mainCssChunkMatcher,
    registerModuleGraphCandidates,
    runtimeState,
    styleHandler,
    syncSourceCandidatesForHotUpdate,
    tailwindRootCssModuleIds = [],
    generateCss,
    hmrCssModuleVersions,
    jsHandler,
    ensureRuntimeClassSet,
    getResolvedConfig,
    isEnabled = () => true,
    isNativeAppStyleTarget = () => false,
    isWebGeneratorTarget = () => resolveUniUtsPlatform().isWeb,
    uniAppX,
    viteProcessedCssSourceFiles = [],
    webCssEntryDiagnostics,
  } = options
  const resolvedUniAppXOptions = resolveUniAppXOptions(uniAppX)
  const utsPlatform = resolveUniUtsPlatform()
  const isIosPlatform = providedIosPlatform ?? utsPlatform.isAppIos
  const cssHandlerOptionsCache = new Map<string, {
    isMainChunk: boolean
    uniAppXCssTarget?: 'uvue' | undefined
    uniAppXCssSource?: 'tailwind-root' | 'author-apply' | undefined
    uniAppXUnsupported: 'error' | 'warn' | 'silent'
    postcssOptions: {
      options: {
        from: string
        map: {
          inline: false
          annotation: false
          sourcesContent: true
        }
      }
    }
  }>()
  const nativeLocalStyleModuleIds = new Set<string>()
  const sfcStyleSources = createUniAppXSfcStyleSources()
  const pendingSfcTransforms = new Map<string, Promise<Pick<SourceDescription, 'code' | 'map'> | undefined>>()
  const webSfcHmr = createUniAppXWebSfcHmr({
    isEnabled: () => isEnabled() && isWebGeneratorTarget() && getResolvedConfig()?.command === 'serve',
    transform: (source, id) => runTransformSfc(source, id, {}),
    hmrCssModuleVersions,
  })
  const webLocalStyle = createUniAppXWebLocalStyleBridge(isWebGeneratorTarget, hmrCssModuleVersions)
  let componentLocalStyleEnabled: boolean | undefined
  const isNativeAppBuildTarget = createUniAppXNativeBuildTargetResolver(getResolvedConfig)
  const nativeHmrReloader = createUniAppXNativeHmrReloader({
    ensureRuntimeClassSet,
    isNativeAppBuildTarget,
    localStyleModuleIds: nativeLocalStyleModuleIds,
    syncSourceCandidates: syncSourceCandidatesForHotUpdate,
    tailwindRootCssModuleIds,
    viteProcessedCssSourceFiles,
  })
  function shouldEnableComponentLocalStyle() {
    if (!resolvedUniAppXOptions.componentLocalStyles.enabled) {
      componentLocalStyleEnabled = false
      return false
    }
    if (!resolvedUniAppXOptions.componentLocalStyles.onlyWhenStyleIsolationVersion2) {
      componentLocalStyleEnabled = true
      return true
    }
    if (componentLocalStyleEnabled !== undefined) {
      return componentLocalStyleEnabled
    }
    const root = getResolvedConfig()?.root
    componentLocalStyleEnabled = resolveUniAppXStyleIsolationEnabled(root)
    return componentLocalStyleEnabled
  }
  function shouldEnablePageLocalStyleForFile(id: string) {
    return resolvedUniAppXOptions.componentLocalStyles.enabled && (isNativeAppBuildTarget(id) || isPageLocalStyleFile(id, resolvedUniAppXOptions.componentLocalStyles.pageMatcher))
  }
  function isHarmonyBuildTarget() {
    if (resolveUniUtsPlatform().isAppHarmony) {
      return true
    }
    return isUniAppXHarmonyOutDir(getResolvedConfig()?.build?.outDir)
  }
  function getStyleHandlerOptions(id: string, source?: 'tailwind-root' | 'author-apply') {
    const isMainChunk = source === 'tailwind-root' || mainCssChunkMatcher(id, appType)
    const cacheKey = `${isMainChunk ? '1' : '0'}:${source ?? ''}:${id}`
    let styleHandlerOptions = cssHandlerOptionsCache.get(cacheKey)
    if (!styleHandlerOptions) {
      styleHandlerOptions = omitUndefined({
        isMainChunk,
        uniAppXCssTarget: isNativeAppBuildTarget(id) ? resolveUniAppXCssTarget(id) : undefined,
        uniAppXCssSource: isNativeAppBuildTarget(id) ? source : undefined,
        uniAppXUnsupported: resolvedUniAppXOptions.uvueUnsupported,
        postcssOptions: {
          options: {
            from: id,
            map: {
              inline: false,
              annotation: false,
              // PostCSS 可能返回虚拟文件，因此需要启用这一项以获取源内容
              sourcesContent: true,
              // 若上游预处理器已经生成 source map，sources 中可能出现重复条目
            },
          },
        },
      }) as NonNullable<ReturnType<typeof cssHandlerOptionsCache.get>>
      cssHandlerOptionsCache.set(cacheKey, styleHandlerOptions)
    }
    return styleHandlerOptions
  }

  async function transformStyle(code: string, id: string, query?: ReturnType<typeof parseVueRequest>['query'], hookContext?: { addWatchFile?: (id: string) => void }) {
    const isNativeStyle = isNativeAppBuildTarget(id)
    const parsed = query ?? parseVueRequest(id).query
    const resolvedSource = resolveUniAppXStyleSource(code, parsed)
    if (resolvedSource.skip) {
      return
    }
    code = resolvedSource.code
    if (isCSSRequest(id) || (parsed.vue && parsed.type === 'style')) {
      if (isCssModuleExport(code)) {
        return
      }
      const sourceCode = normalizeRelativeTailwindReferences(
        restoreUniAppXImportantApplyMarker(code),
        id,
      )
      const hasTailwindRoot = hasTailwindRootDirectives(sourceCode, { importFallback: true })
      const hasTailwindApply = hasTailwindApplyDirective(sourceCode)
      const shouldGenerateCss = hasTailwindRoot || hasTailwindApply
      const isNativeSfcAuthorStyle = isNativeStyle && resolveUniAppXCssTarget(id) === 'uvue'
      if (!shouldGenerateCss && (!isNativeStyle || isNativeSfcAuthorStyle)) {
        return
      }
      harmonyApply.rememberSource(sourceCode, id)
      const generatedCss = (
        shouldGenerateCss
      )
        ? await generateCss?.(
            id,
            isNativeSfcAuthorStyle && hasTailwindApply && !hasTailwindRoot
              ? harmonyApply.prepareStyles(sourceCode, id)
              : sourceCode,
            {
              ...hookContext,
              disableSourceScan: isNativeSfcAuthorStyle && hasTailwindApply && !hasTailwindRoot,
              ...(isNativeSfcAuthorStyle && hasTailwindApply && !hasTailwindRoot ? { sourceCandidates: [] } : {}),
              transient: isNativeSfcAuthorStyle && hasTailwindApply && !hasTailwindRoot,
            },
          )
        : undefined
      const styleCode = typeof generatedCss === 'string' && generatedCss.trim().length > 0
        ? hasTailwindApply && !hasTailwindRoot
          ? retainUniAppXAuthorApplyCss(generatedCss, sourceCode, { preserveRuntimeProperties: isWebGeneratorTarget() })
          : generatedCss
        : sourceCode
      const styleHandlerOptions = getStyleHandlerOptions(
        id,
        isNativeStyle && hasTailwindRoot ? 'tailwind-root' : isNativeStyle ? 'author-apply' : undefined,
      )
      // Web 生成结果已完成目标转换，只生成映射，避免再次套用小程序选择器与变量降级。
      const postcssResult = isWebGeneratorTarget() && typeof generatedCss === 'string' && generatedCss.trim().length > 0
        ? await postcss().process(styleCode, styleHandlerOptions.postcssOptions.options)
        : await styleHandler(styleCode, styleHandlerOptions)
      return createUniAppXStyleResult(id, postcssResult)
    }
  }

  const harmonyApply = createUniAppXHarmonyApplyExpander({
    generateCss,
    getResolvedConfig,
    isHarmonyBuildTarget,
    async transformCss(css, id) {
      const result = await styleHandler(css, getStyleHandlerOptions(id, 'author-apply'))
      reportStyleWarnings(result)
      return result.css
    },
  })
  const cssPrePlugin: Plugin = {
    name: 'weapp-tailwindcss:uni-app-x:css:pre',
    enforce: 'pre',
    handleHotUpdate: { order: 'pre', handler: ctx => webSfcHmr.prepare(ctx) },
    load: {
      order: 'pre',
      async handler(id) {
        const { filename, query } = parseVueRequest(id)
        if (!query.vue || query.type !== 'style' || !UVUE_NVUE_RE.test(filename)) {
          return
        }
        await pendingSfcTransforms.get(cleanUrl(filename))
        return sfcStyleSources.load(filename, query.index ?? 0)
      },
    },
    async transform(code, id) {
      if (!isEnabled()) {
        return
      }
      await runtimeState.readyPromise
      const { filename, query } = parseVueRequest(id)
      if (query.vue && query.type === 'style') {
        await pendingSfcTransforms.get(cleanUrl(filename))
      }
      const generatedSource = sfcStyleSources.getGenerated(filename, query.index ?? 0)
      const resolvedSource = resolveUniAppXStyleSource(code, query, generatedSource)
      if (resolvedSource.skip) {
        return
      }
      const styleCode = query.vue && query.type === 'style' && generatedSource === undefined && !sfcStyleSources.hasGenerated(filename)
        ? webLocalStyle.appendToStyle(resolvedSource.code, id)
        : resolvedSource.code
      // Vite 热更新会绕过 SFC 主模块，直接把原始样式交给预处理器；先移除
      // Sass 无法解析的 important utility 后，再由后续 CSS 阶段还原。
      const preprocessorCode = query.vue && query.type === 'style'
        ? normalizeUniAppXImportantApplyForSass(styleCode)
        : styleCode
      const preprocessor = resolvePreprocessorTransform(preprocessorCode, id, query.lang, {
        isIosPlatform,
        isNativeAppStyleTarget: isNativeAppStyleTarget(),
      })
      if (preprocessor) {
        return preprocessor.result ?? (preprocessorCode !== code ? { code: preprocessorCode, map: null } : undefined)
      }
      const result = await transformStyle(preprocessorCode, id, query, this)
      // 提取或清空 style 来源本身也是转换，即使当前 CSS 不需要 Tailwind 处理。
      return result ?? (preprocessorCode !== code ? { code: preprocessorCode, map: null } : undefined)
    },
  }
  const cssPlugin: Plugin = {
    name: 'weapp-tailwindcss:uni-app-x:css',
    async transform(code, id) {
      if (!isEnabled()) {
        return
      }
      await runtimeState.readyPromise
      return transformStyle(code, id, undefined, this)
    },
  }

  const cssPlugins = [cssPlugin, cssPrePlugin]

  async function transformSfc(code: string, id: string, context: { addWatchFile?: (id: string) => void }) {
    sfcStyleSources.rememberSource(id, code)
    if (isWebGeneratorTarget()) {
      for (const style of extractSfcStyleBlocks(code)) {
        webCssEntryDiagnostics?.observeSourceImports(style.source, id)
      }
    }
    if (isNativeAppBuildTarget(id)) {
      nativeLocalStyleModuleIds.add(id)
      nativeLocalStyleModuleIds.add(cleanUrl(id))
    }
    harmonyApply.rememberSource(code, id, true)
    const enableComponentLocalStyle = shouldEnableComponentLocalStyle()
    const enablePageLocalStyle = shouldEnablePageLocalStyleForFile(id)
    const moduleGraphCandidates = await registerModuleGraphCandidates?.(id, code)
    const runtimeSet = await ensureRuntimeClassSet()
    const currentRuntimeSet: Set<string> = moduleGraphCandidates?.size
      ? new Set([...runtimeSet, ...moduleGraphCandidates])
      : runtimeSet
    nativeHmrReloader.remember(currentRuntimeSet)
    const transformUVue = await loadTransformUVue()
    const transformOptions = omitUndefined({
      componentMatcher: resolvedUniAppXOptions.componentLocalStyles.componentMatcher,
      ...(customAttributesEntities.length > 0 ? { customAttributesEntities } : {}),
      ...(disabledDefaultTemplateHandler ? { disabledDefaultTemplateHandler } : {}),
      ...(enableComponentLocalStyle ? { enableComponentLocalStyle } : {}),
      ...(enablePageLocalStyle ? { enablePageLocalStyle } : {}),
      native: true,
      localStyleVariants: !isNativeAppBuildTarget(id) && !isWebGeneratorTarget() ? true : undefined,
      ...resolveUniAppXBorderPreflightOptions(options, isWebGeneratorTarget()),
      pageMatcher: resolvedUniAppXOptions.componentLocalStyles.pageMatcher,
      ...(isWebGeneratorTarget() && customAttributesEntities.length > 0 ? { webCustomAttributeDeep: true } : {}),
      ...(isWebGeneratorTarget()
        ? {
            onWebLocalStyleRules: (rules: string) => {
              webLocalStyle.remember(id, rules)
              webCssEntryDiagnostics?.requestCheck()
            },
          }
        : {}),
    })
    const result = Object.keys(transformOptions).length > 0
      ? transformUVue(code, id, jsHandler, currentRuntimeSet, transformOptions)
      : transformUVue(code, id, jsHandler, currentRuntimeSet)
    sfcStyleSources.rememberGenerated(id, isWebGeneratorTarget() ? result?.code ?? '' : '')
    if (!result?.code) {
      return result
    }
    harmonyApply.rememberSource(result.code, id)
    const expandedCode = await harmonyApply.expandStyles(result.code, id, context)
    return expandedCode === result.code ? result : { code: expandedCode, map: null }
  }

  function runTransformSfc(code: string, id: string, context: { addWatchFile?: (id: string) => void }) {
    const file = cleanUrl(id)
    const pending = transformSfc(code, id, context)
    pendingSfcTransforms.set(file, pending)
    const cleanup = () => {
      if (pendingSfcTransforms.get(file) === pending) {
        pendingSfcTransforms.delete(file)
      }
    }
    void pending.then(cleanup, cleanup)
    return pending
  }

  const nvuePlugin: Plugin = {
    name: 'weapp-tailwindcss:uni-app-x:nvue',
    enforce: 'pre',
    async buildStart() {
      if (!isEnabled()) {
        return
      }
      await nativeHmrReloader.refreshBaseline()
    },
    transform: {
      order: 'pre',
      async handler(code, id) {
        if (!isEnabled()) {
          return
        }
        const { query } = parseVueRequest(id)
        if (!UVUE_NVUE_QUERY_RE.test(id) || (query.vue && query.type === 'style')) {
          return
        }
        // Web 子模块已经由完整 SFC 编译得到，不能再次登记为 SFC、覆盖样式来源
        // 或替换正在等待的主模块事务；原生模板子请求仍由原生转换链处理。
        if (isWebGeneratorTarget() && query.vue && query.type) {
          return
        }
        return runTransformSfc(code, id, this)
      },
    },
    handleHotUpdate: {
      order: 'post',
      async handler(ctx) {
        if (!isEnabled() || getResolvedConfig()?.command !== 'serve') {
          return
        }
        if (!UVUE_NVUE_RE.test(ctx.file) && !isCSSRequest(ctx.file)) {
          return
        }
        if (await webSfcHmr.finish(ctx)) {
          return []
        }
        return webLocalStyle.handleHotUpdate(ctx) ?? nativeHmrReloader.handleHotUpdate(ctx)
      },
    },
    buildEnd() {
      if (isWebGeneratorTarget()) {
        webCssEntryDiagnostics?.flush()
      }
    },
    closeBundle() {
      webCssEntryDiagnostics?.dispose()
    },
  }

  const stylePlaceholderPlugin: Plugin = {
    name: 'weapp-tailwindcss:uni-app-x:style-placeholder',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        if (!isEnabled()) {
          return
        }
        const currentUtsPlatform = resolveUniUtsPlatform()
        const canInferHarmonyTarget = !currentUtsPlatform.normalized || currentUtsPlatform.isApp
        const isHarmonyTarget = currentUtsPlatform.isAppHarmony || (canInferHarmonyTarget && isHarmonyBuildTarget())
        if (!isNativeAppBuildTarget() && !isHarmonyTarget) {
          return
        }
        const getAssetSource = createUniAppXBundleAssetSourceGetter(bundle)
        if (isHarmonyTarget) {
          const cssSources: string[] = []
          const applyStyleSources = harmonyApply.styleSources.size > 0
            ? [...harmonyApply.styleSources]
            : collectUniAppXHarmonyApplyStyleSources(bundle)
          const applyUtilities = new Set([
            ...harmonyApply.utilities,
            ...collectUniAppXHarmonyApplyUtilities(bundle),
          ])
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
            componentMatcher: resolvedUniAppXOptions.componentLocalStyles.componentMatcher,
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

  return [
    ...cssPlugins,
    nvuePlugin,
    stylePlaceholderPlugin,
  ]
}
