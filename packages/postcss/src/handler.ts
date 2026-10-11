// 样式处理入口，负责构建和复用 PostCSS 管线
import type { Input, Result as PostcssResult, Root } from 'postcss'
import type { FeatureSignal } from './content-probe'
import type { RootCacheSnapshot } from './root-cache'
import type { IStyleHandlerOptions, StyleHandler } from './types'
import { performance } from 'node:perf_hooks'
import { defuOverrideArray } from '@weapp-tailwindcss/shared'
import { LRUCache } from 'lru-cache'
import postcss from 'postcss'
import { isAutoprefixerPlugin } from './autoprefixer'
import { protectDynamicColorMixAlpha, protectDynamicVarFallbacks } from './compat/color-mix'
import { normalizeCssLineComments } from './compat/line-comments'
import { removeEmptyBlockAtRules } from './compat/mini-program-css/root-cleanups'
import { splitUnresolvedAuthorVariableFallbacks } from './compat/uni-app-x-uvue/theme'
import { probeFeatures, signalToCacheKey } from './content-probe'
import { getDefaultOptions } from './defaults'
import { fingerprintStyleOptions } from './fingerprint'
import { processUserCss } from './framework-pipeline'
import { resolvePostcssFrameworkProfile } from './frameworks'
import { createOptionsResolver, normalizeCssOptions } from './options-resolver'
import { isKnownPurePostcssPlugin } from './plugin-cache-policy'
import { createInjectPreflight } from './preflight'
import { StyleProcessorCache } from './processor-cache'
import { captureRootCacheSnapshot, cloneRootWithCurrentSources, matchRootCacheSnapshot } from './root-cache'
import { contentHash } from './utils/content-hash'

/** CSS 结果缓存最大条目数 */
const CSS_RESULT_CACHE_MAX = 256

// createStyleHandler 提供带缓存的高阶处理器，同时暴露 getPipeline 供外部调试/扩展
export function createStyleHandler(options?: Partial<IStyleHandlerOptions>): StyleHandler {
  const normalizedOptions = normalizeCssOptions(options ?? {})
  const cachedOptions = defuOverrideArray<
    IStyleHandlerOptions,
    Partial<IStyleHandlerOptions>[]
  >(
    normalizedOptions as IStyleHandlerOptions,
    // 嵌套配置也必须合入同一份默认值，避免后续归一化用 undefined/部分对象覆盖默认值。
    normalizeCssOptions(getDefaultOptions(normalizedOptions), normalizedOptions.cssOptions !== undefined),
  )

  cachedOptions.cssInjectPreflight = createInjectPreflight(cachedOptions.cssPreflight)
  const resolver = createOptionsResolver(cachedOptions)
  const processorCache = new StyleProcessorCache()
  // 首次处理拿到内容信号后再创建管线，避免提前构建一条不会使用的完整管线。

  /** CSS 处理结果 LRU 缓存 */
  const resultCache = new LRUCache<string, { source: string, options: string, root: RootCacheSnapshot | undefined, result: PostcssResult }>({
    max: CSS_RESULT_CACHE_MAX,
    // AST 快照按节点数约束总量，避免少量大样式占满长会话内存。
    maxSize: 128_000,
    sizeCalculation: entry => Math.max(1, entry.root?.nodes.length ?? 0),
  })

  function cloneResult(result: PostcssResult, current?: ReadonlyMap<Input, Input>): PostcssResult {
    if (!result.root || typeof result.root.clone !== 'function') {
      return result
    }
    const clonedRoot = cloneRootWithCurrentSources(result.root as Root, current)
    // 没有 source map 时 CSS 已确定，复制结果不必再次序列化整棵 AST。
    const cloned = result.opts.map
      ? clonedRoot.toResult(result.opts)
      : Object.assign(new postcss.Result(result.processor, clonedRoot, result.opts), { css: result.css })
    cloned.messages.push(...(result.messages ?? []))
    return cloned
  }

  function processSource(
    rawSource: string,
    root: Root | undefined,
    cloneOutput: boolean,
    opt?: Partial<IStyleHandlerOptions>,
    emitDiagnostics = true,
    sourcePrepared = false,
  ) {
    const resolvedOptions = resolver.resolve(opt)
    const plugins = resolvedOptions.postcssOptions?.plugins
    const hasUserPlugins = Boolean(plugins && Object.keys(plugins).length > 0)
    const configured = Array.isArray(plugins) ? plugins : Object.values(plugins ?? {})
    const hasExternalPlugins = hasUserPlugins && !configured.every(isKnownPurePostcssPlugin)
    let cacheable = !hasExternalPlugins
    const normalizedRawSource = sourcePrepared ? rawSource : normalizeCssLineComments(rawSource)
    // uni-app x 的 WebView/小程序目标也会复用 preserve:false 的 preset，
    // 需要先保护作者变量，否则主题 fallback 会在生成阶段被静态化。
    const isUniAppXFramework = resolvedOptions.appType === 'uni-app-x'
    const protectedVarFallbacks = !sourcePrepared && (resolvedOptions.uniAppX || isUniAppXFramework)
      ? protectDynamicVarFallbacks(normalizedRawSource)
      : {
          css: normalizedRawSource,
          restore: (value: string) => value,
        }
    const protectedColorMix = !sourcePrepared && resolvedOptions.majorVersion === 4
      ? protectDynamicColorMixAlpha(protectedVarFallbacks.css)
      : undefined
    const source = protectedColorMix?.css ?? protectedVarFallbacks.css
    const getProcessInput = () => source !== normalizedRawSource ? source : root?.clone() ?? source
    const restoreProtectedResult = (result: PostcssResult) => {
      const restoredCss = protectedVarFallbacks.restore(protectedColorMix?.restore(result.css) ?? result.css)
      if (restoredCss !== result.css) {
        const restored = result.root.clone().toResult(result.opts)
        restored.css = restoredCss
        restored.root = postcss.parse(restoredCss, result.opts)
        restored.messages.push(...result.messages)
        return restored
      }
      return result
    }
    if (hasExternalPlugins) {
      const userAutoprefixer = configured.some(plugin => isAutoprefixerPlugin(plugin as never))
        || (!Array.isArray(plugins) && Boolean(plugins?.autoprefixer))
      // 用户阶段每次执行；只有它完成后的 AST 才能作为确定性平台阶段的缓存输入。
      const platformOptions = {
        ...resolvedOptions,
        ...(userAutoprefixer ? { autoprefixer: false as const, cssOptions: { ...resolvedOptions.cssOptions, autoprefixer: false as const } } : {}),
        postcssOptions: { ...resolvedOptions.postcssOptions, plugins: [] },
      }
      const stageStartedAt = performance.now()
      const userInput = getProcessInput()
      const userRoot = typeof userInput === 'string' ? postcss.parse(userInput, resolvedOptions.postcssOptions?.options) : userInput
      const firstUserNode = userRoot.first
      const firstUserBefore = firstUserNode?.raws.before
      return processUserCss(userRoot, { ...resolvedOptions.postcssOptions, options: { ...resolvedOptions.postcssOptions?.options, map: false } })
        .then(async (prepared) => {
          const preparedSource = prepared.root.toString()
          // 用户阶段串行化时推导的缩进缓存不能带入改变层级的后续平台转换。
          delete (prepared.root as Root & { rawCache?: unknown }).rawCache
          const transformed = await processSource(preparedSource, prepared.root as Root, true, platformOptions, false, true)
          let result = restoreProtectedResult(transformed)
          // 作者删除首节点的空白归属必须跨 layer 提升保留，不能重新暴露块内缩进。
          if (firstUserNode && !firstUserNode.parent && result.root.first && result.root.first.raws.before !== firstUserBefore) {
            result.root.first.raws.before = firstUserBefore
            const updated = result.root.toResult(result.opts)
            updated.messages.push(...result.messages)
            result = updated
          }
          result.messages.unshift(...prepared.messages)
          if (emitDiagnostics) {
            await resolvedOptions.onDiagnostic?.({ phase: 'postcss', durationMs: performance.now() - stageStartedAt, cache: { hit: false } })
          }
          return result
        })
        .catch(async (error) => {
          if (emitDiagnostics) {
            await resolvedOptions.onDiagnostic?.({ phase: 'postcss', durationMs: performance.now() - stageStartedAt, error: { name: error instanceof Error ? error.name : undefined, message: error instanceof Error ? error.message : String(error) } })
          }
          throw error
        })
    }
    // 外部插件已经完成，平台阶段探测本轮实际输入；包内 macro 仍随管线执行时保持保守探测。
    let signal: FeatureSignal | undefined
    if (!hasUserPlugins) {
      try {
        signal = probeFeatures(source)
      }
      catch {
        signal = undefined
      }
    }

    // 构建缓存键：选项指纹 + 信号 + 内容哈希
    const optsFp = fingerprintStyleOptions(resolvedOptions)
    const signalKey = signal ? signalToCacheKey(signal) : ''
    const cacheKey = `${optsFp}|${signalKey}|${contentHash(source)}|${root === undefined ? 'text' : 'root'}`

    const cached = cacheable ? resultCache.get(cacheKey) : undefined
    const sameInput = cached?.source === rawSource && cached.options === optsFp
    let bindings: ReadonlyMap<Input, Input> | undefined
    if (sameInput && root && cached.root) {
      try {
        bindings = matchRootCacheSnapshot(cached.root, root)
      }
      catch { cacheable = false }
    }
    if (sameInput && (root ? bindings !== undefined : cached.root === undefined)) {
      if (emitDiagnostics) {
        void resolvedOptions.onDiagnostic?.({ phase: 'postcss', durationMs: 0, cache: { hit: true, key: cacheKey } })
      }
      return Promise.resolve(cloneOutput ? cloneResult(cached.result, bindings) : cached.result)
    }

    let rootSnapshot: RootCacheSnapshot | undefined
    if (cacheable && root) {
      try {
        rootSnapshot = captureRootCacheSnapshot(root)
      }
      catch { cacheable = false }
    }
    const processor = processorCache.getProcessor(resolvedOptions, signal)
    const processOptions = processorCache.getProcessOptions(resolvedOptions)

    const startedAt = performance.now()
    return processor.process(
      getProcessInput(),
      processOptions,
    ).async().then(async (result) => {
      const styleBranch = resolvePostcssFrameworkProfile(resolvedOptions)
      let finalResult = styleBranch.postprocess(result, resolvedOptions)
      if (resolvedOptions.isMainChunk !== false && finalResult.root) {
        let removed = 0
        let removedTotal = 0
        do {
          removed = removeEmptyBlockAtRules(finalResult.root)
          removedTotal += removed
        } while (removed > 0)
        if (removedTotal > 0) {
          const nextResult = finalResult.root.toResult(finalResult.opts)
          nextResult.messages.push(...finalResult.messages)
          finalResult = nextResult
        }
      }
      finalResult = restoreProtectedResult(finalResult)
      const shouldSplitAuthorVariableFallbacks = resolvedOptions.uniAppX
        && (resolvedOptions.uniAppXCssTarget === 'uvue' || !isUniAppXFramework)
      if (shouldSplitAuthorVariableFallbacks && finalResult.root) {
        const changed = splitUnresolvedAuthorVariableFallbacks(finalResult.root, new Map())
        if (changed) {
          finalResult.css = finalResult.root.toString()
        }
      }
      // 缓存最终结果
      if (cacheable) {
        // 短哈希仅用于索引，命中还须核对保护占位前的完整输入及配置。
        resultCache.set(cacheKey, { source: rawSource, options: optsFp, root: rootSnapshot, result: finalResult })
      }
      if (emitDiagnostics) {
        await resolvedOptions.onDiagnostic?.({ phase: 'postcss', durationMs: performance.now() - startedAt, cache: { hit: false, key: cacheKey } })
      }
      return cloneOutput ? cloneResult(finalResult) : finalResult
    }).catch(async (error) => {
      if (emitDiagnostics) {
        await resolvedOptions.onDiagnostic?.({ phase: 'postcss', durationMs: performance.now() - startedAt, cache: { hit: false, key: cacheKey }, error: { name: error instanceof Error ? error.name : undefined, message: error instanceof Error ? error.message : String(error) } })
      }
      throw error
    })
  }

  const handler = ((rawSource: string, opt?: Partial<IStyleHandlerOptions>) => {
    return processSource(rawSource, undefined, false, opt)
  }) as StyleHandler

  handler.transformRoot = async (root, opt) => {
    const result = await processSource(root.toString(), root, true, opt)
    assertRootResult(result)
    return result
  }

  handler.getPipeline = (opt?: Partial<IStyleHandlerOptions>) => {
    const resolvedOptions = resolver.resolve(opt)
    return processorCache.getPipeline(resolvedOptions)
  }

  return handler
}

/** 单个 Root 的变换不得返回多文档结果，避免破坏调用方的产物归属。 */
function assertRootResult(result: PostcssResult): asserts result is PostcssResult<Root> {
  if (result.root.type !== 'root') {
    throw new TypeError('StyleHandler.transformRoot must return a single PostCSS Root.')
  }
}
