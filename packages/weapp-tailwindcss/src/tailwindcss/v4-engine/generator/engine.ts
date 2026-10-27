import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { TailwindV4Engine, TailwindV4GenerateOptions, TailwindV4ResolvedSource } from '../types'
import type { PreparedTailwindV4Source } from './prepared-source'
import { createTailwindV4Engine as createEngineTailwindV4Engine } from '@weapp-tailwindcss/engine'
import { collectStaticCustomPropertyValues, createCssRuntimeAffectingSignature } from '@weapp-tailwindcss/postcss/transform'
import { transformTailwindV4CssByTarget } from '../miniprogram'
import { createIncrementalGenerateCacheKey, createIncrementalStyleOptions, hasRemovedCandidates, incrementalGenerateCache, normalizeTargetRpxLengthCandidates, resolveStyleOptions, resolveTargetCandidates, runIncrementalGenerateTask, seedIncrementalGenerateCache, shouldRebuildIncrementalEntry } from './incremental-cache'
import { TailwindV4NativeSessionPool } from './native-session'
import { prepareTailwindV4Source } from './prepared-source'
import { generateRawArtifact, transformGeneratedArtifact } from './raw-generation'
import { restoreRpxLengthCssSelectors } from './rpx-candidates'
import { hasChangedCssCalcContext, hasChangedCustomPropertyCompatibilityContext, resolveGenerationStyleContext, resolveIncrementalStyleContext } from './style-context'

let nextEngineIdentity = 0

export function createTailwindV4Engine(source: TailwindV4ResolvedSource): TailwindV4Engine {
  const engineIdentity = ++nextEngineIdentity
  const generationSessions = new TailwindV4NativeSessionPool()
  const incrementalCacheKeys = new Set<string>()
  const validationEngine = createEngineTailwindV4Engine(source)
  const activeTasks = new Set<Promise<unknown>>()
  let disposed = false
  let disposal: Promise<void> | undefined

  function ensureActive() {
    if (disposed) {
      throw new Error('TailwindV4Engine 已释放。')
    }
  }

  const seedCache: typeof seedIncrementalGenerateCache = options => !disposed && seedIncrementalGenerateCache(options)

  function track<T>(task: Promise<T>) {
    activeTasks.add(task)
    void task.then(() => activeTasks.delete(task), () => activeTasks.delete(task))
    return task
  }

  function clearCache() {
    for (const cacheKey of incrementalCacheKeys) {
      incrementalGenerateCache.delete(cacheKey)
    }
    incrementalCacheKeys.clear()
  }

  async function generateOnce(generateSource: TailwindV4ResolvedSource, options: TailwindV4GenerateOptions = {}, preparedSource?: PreparedTailwindV4Source) {
    return transformGeneratedArtifact(await generateRawArtifact(generationSessions, generateSource, options, preparedSource))
  }

  async function generateWithIncrementalCache(options: TailwindV4GenerateOptions = {}) {
    const target = options.target ?? 'weapp'
    const preparedSource = prepareTailwindV4Source(source, target)
    const { cssMacroSource, compatibleSource } = preparedSource
    const requestedCandidates = resolveTargetCandidates(options.candidates, target)
    const styleOptions = resolveStyleOptions(source, options.styleOptions)

    if ((options.sources?.length ?? 0) > 0 || options.bareArbitraryValues !== undefined || Array.isArray(options.scanSources)) {
      return generateOnce(cssMacroSource, options, preparedSource)
    }

    const cacheKey = `${engineIdentity}\0${createIncrementalGenerateCacheKey(
      compatibleSource,
      target,
      styleOptions,
    )}`
    incrementalCacheKeys.add(cacheKey)

    if (options.scanSources === true) {
      return runIncrementalGenerateTask(cacheKey, requestedCandidates, options.scanSources, async () => {
        const generated = await generateOnce(cssMacroSource, options, preparedSource)
        const admitted = seedCache({ cacheKey, compatibleSource, generated, requestedCandidates, styleOptions, target })
        if (!admitted) {
          incrementalGenerateCache.delete(cacheKey)
        }
        return generated
      })
    }

    const cached = incrementalGenerateCache.get(cacheKey)
    if (cached) {
      if (hasRemovedCandidates(cached.seenCandidates, requestedCandidates)) {
        return runIncrementalGenerateTask(cacheKey, requestedCandidates, options.scanSources, async () => {
          const generated = await generateOnce(cssMacroSource, options, preparedSource)
          const admitted = seedCache({ cacheKey, compatibleSource, generated, requestedCandidates, styleOptions, target })
          if (!admitted) {
            incrementalGenerateCache.delete(cacheKey)
          }
          return generated
        })
      }

      const missingCandidates = [...requestedCandidates].filter(candidate => !cached.seenCandidates.has(candidate))
      if (missingCandidates.length === 0) {
        return {
          css: cached.css,
          rawCss: cached.rawCss,
          incrementalCss: '',
          incrementalRawCss: '',
          classSet: new Set(cached.classSet),
          rawCandidates: new Set(cached.seenCandidates),
          customPropertyValues: new Map(cached.customPropertyValues),
          customPropertyContextCss: resolveGenerationStyleContext(compatibleSource.css, cached.rawCss, styleOptions)?.customPropertyContextCss,
          dependencies: cached.dependencies,
          sources: cached.sources,
          root: cached.root,
          target: cached.target,
        }
      }

      if (shouldRebuildIncrementalEntry(cached, requestedCandidates, missingCandidates)) {
        return runIncrementalGenerateTask(cacheKey, requestedCandidates, options.scanSources, async () => {
          const generated = await generateOnce(cssMacroSource, options, preparedSource)
          const admitted = seedCache({ cacheKey, compatibleSource, generated, requestedCandidates, styleOptions, target })
          if (!admitted) {
            incrementalGenerateCache.delete(cacheKey)
          }
          return generated
        })
      }

      return runIncrementalGenerateTask(cacheKey, requestedCandidates, options.scanSources, async () => {
        const designSystem = await cached.designSystemPromise
        const normalizedMissing = normalizeTargetRpxLengthCandidates(missingCandidates, target, styleOptions)
        const normalizedMissingCandidates = [...normalizedMissing.candidates]
        const cssByCandidate = designSystem.candidatesToCss(normalizedMissingCandidates)
        const rawCssParts: string[] = []
        const classSet = new Set<string>()
        for (let index = 0; index < normalizedMissingCandidates.length; index += 1) {
          const candidate = normalizedMissingCandidates[index]
          const css = cssByCandidate[index]
          if (candidate && typeof css === 'string' && css.trim().length > 0) {
            rawCssParts.push(restoreRpxLengthCssSelectors(css, normalizedMissing.restoreCandidates))
            classSet.add(normalizedMissing.restoreCandidates.get(candidate) ?? candidate)
          }
        }
        const rawCss = rawCssParts.join('\n')
        const fullRawCss = [cached.rawCss, rawCss].filter(Boolean).join('\n')
        // 完整产物同时确认主题、keyframes、@property 依赖及规则顺序，追加不能改变层叠结果。
        const artifact = await generateRawArtifact(generationSessions, cssMacroSource, options, preparedSource)
        const needsFullTransform = createCssRuntimeAffectingSignature(fullRawCss) !== createCssRuntimeAffectingSignature(artifact.rawCss)
          || hasChangedCssCalcContext(cached.rawCss, artifact.rawCss, styleOptions)
        const compatibilityValues = !needsFullTransform && target === 'weapp' ? collectStaticCustomPropertyValues(artifact.rawCss) : undefined
        if (needsFullTransform
          || (compatibilityValues && hasChangedCustomPropertyCompatibilityContext(cached.compatibilityValues, compatibilityValues))) {
          const generated = await transformGeneratedArtifact(artifact)
          const admitted = seedCache({ cacheKey, compatibleSource, generated, requestedCandidates, styleOptions, target })
          if (!admitted) {
            incrementalGenerateCache.delete(cacheKey)
          }
          return generated
        }
        const styleContext = target === 'weapp'
          ? resolveIncrementalStyleContext(compatibleSource.css, fullRawCss, styleOptions, compatibilityValues)
          : resolveGenerationStyleContext(compatibleSource.css, fullRawCss, styleOptions)
        const incrementalCss = rawCss.length > 0
          ? await transformTailwindV4CssByTarget(rawCss, target, {
              ...createIncrementalStyleOptions(styleContext),
            } as Partial<IStyleHandlerOptions>)
          : ''

        for (const candidate of missingCandidates) {
          cached.seenCandidates.add(candidate)
        }
        for (const className of classSet) {
          cached.classSet.add(className)
        }
        cached.css = [cached.css, incrementalCss].filter(Boolean).join('\n')
        cached.rawCss = fullRawCss
        return {
          css: cached.css,
          rawCss: cached.rawCss,
          incrementalCss,
          incrementalRawCss: rawCss,
          classSet: new Set(cached.classSet),
          rawCandidates: new Set(cached.seenCandidates),
          customPropertyValues: new Map(cached.customPropertyValues),
          customPropertyContextCss: styleContext?.customPropertyContextCss,
          dependencies: cached.dependencies,
          sources: cached.sources,
          root: cached.root,
          target: cached.target,
        }
      })
    }

    return runIncrementalGenerateTask(cacheKey, requestedCandidates, options.scanSources, async () => {
      const generated = await generateOnce(cssMacroSource, options, preparedSource)
      seedCache({ cacheKey, compatibleSource, generated, requestedCandidates, styleOptions, target })
      return generated
    })
  }

  async function generate(options: TailwindV4GenerateOptions = {}) {
    ensureActive()
    return track(options.incrementalCache && options.scanMode !== 'compiled'
      ? generateWithIncrementalCache(options)
      : generateOnce(source, options))
  }

  const engine = {
    source,
    async loadDesignSystem() {
      ensureActive()
      return track(validationEngine.loadDesignSystem())
    },
    async validateCandidates(candidates: Iterable<string>) {
      ensureActive()
      return track(validationEngine.validateCandidates(candidates))
    },
    generate,
    dispose() {
      if (disposal) {
        return disposal
      }
      disposed = true
      clearCache()
      disposal = (async () => {
        await Promise.allSettled([...activeTasks])
        const failures: unknown[] = []
        for (const release of [() => generationSessions.dispose(), () => validationEngine.dispose?.()]) {
          try {
            await release()
          }
          catch (error) {
            failures.push(error)
          }
        }
        activeTasks.clear()
        clearCache()
        if (failures.length) {
          throw new AggregateError(failures, '生成器释放失败，已继续释放其余资源。')
        }
      })()
      return disposal
    },
  }
  return engine
}
