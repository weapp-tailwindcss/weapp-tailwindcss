import type { OutputAsset } from 'rollup'
import type { ViteFrameworkTemplateAssetTransform } from '../shared/framework-asset-strategy'
import type { createEmptyMetrics } from './metrics'
import { logger } from '@weapp-tailwindcss/logger'
import { processCachedTask } from '@/bundlers/shared/cache'
import { createRuntimeAffectingSourceSignature } from '../runtime-affecting-signature'
import { collectUnescapedDynamicCandidates } from './candidates'
import { measureElapsed } from './metrics'
import { createCandidateSignature } from './signatures'

export interface ProcessHtmlBundleEntryOptions {
  cache: Parameters<typeof processCachedTask<string>>[0]['cache']
  context: {
    ensureRuntimeClassSet: (force?: boolean) => Promise<Set<string>>
  }
  debug: (message: string, ...args: unknown[]) => void
  dynamicRetryCandidates: Set<string>
  file: string
  metrics: ReturnType<typeof createEmptyMetrics>
  onUpdate: (file: string, oldVal: string, newVal: string) => void
  originalEntrySource: string
  originalSource: OutputAsset
  rememberProcessCacheKey: (cacheKey: string, hashKey?: string | number) => void
  resolveCurrentSourceCandidateSource: (file: string) => string | undefined
  tasks: Promise<void>[]
  templateHandler: (source: string, options: { runtimeSet: Set<string> }) => string | Promise<string>
  templateTransform?: ViteFrameworkTemplateAssetTransform | undefined
  timeTask: (name: string, task: () => Promise<void>) => Promise<void>
  transformRuntime: Set<string>
  transformRuntimeSignature: string
}

export function processHtmlBundleEntry(options: ProcessHtmlBundleEntryOptions) {
  const {
    cache,
    context,
    debug,
    dynamicRetryCandidates,
    file,
    metrics,
    onUpdate,
    originalEntrySource,
    originalSource,
    rememberProcessCacheKey,
    resolveCurrentSourceCandidateSource,
    tasks,
    templateHandler,
    templateTransform,
    timeTask,
    transformRuntime,
    transformRuntimeSignature,
  } = options
  const currentBundleSource = originalEntrySource
  const candidateSource = resolveCurrentSourceCandidateSource(file) ?? currentBundleSource
  const currentRawDynamicCandidates = new Set([
    ...collectUnescapedDynamicCandidates(candidateSource),
    ...collectUnescapedDynamicCandidates(currentBundleSource),
  ])
  const templateRuntime = currentRawDynamicCandidates.size > 0
    ? new Set([
        ...transformRuntime,
        ...currentRawDynamicCandidates,
      ])
    : transformRuntime
  const templateRuntimeSignature = templateRuntime === transformRuntime
    ? transformRuntimeSignature
    : createCandidateSignature(templateRuntime)
  const htmlProcessHash = `${cache.computeHash(currentBundleSource)}:${cache.computeHash(createRuntimeAffectingSourceSignature(currentBundleSource, 'html'))}:${templateRuntimeSignature}${templateTransform ? `:${templateTransform.cacheKey}` : ''}`
  const cacheKey = `${file}:html:${htmlProcessHash}`
  const hashKey = cacheKey
  rememberProcessCacheKey(cacheKey, hashKey)
  tasks.push(timeTask('html', () =>
    processCachedTask<string>({
      cache,
      cacheKey,
      hashKey,
      hash: htmlProcessHash,
      applyResult(source) {
        originalSource.source = source
      },
      onCacheHit() {
        metrics.html.cacheHits++
        debug('html cache hit: %s', file)
      },
      async transform() {
        const start = performance.now()
        let transformed = await templateHandler(currentBundleSource, {
          runtimeSet: templateRuntime,
        })
        let unresolvedDynamicCandidates = collectUnescapedDynamicCandidates(transformed)
        let retryRuntimeSet: Set<string> | undefined

        if (unresolvedDynamicCandidates.length > 0) {
          const fullRuntimeSet = await context.ensureRuntimeClassSet(true)
          const allowedRetryCandidates = fullRuntimeSet.size === 0
            ? unresolvedDynamicCandidates
            : unresolvedDynamicCandidates.filter(candidate => dynamicRetryCandidates.has(candidate) || fullRuntimeSet.has(candidate))
          retryRuntimeSet = new Set([
            ...fullRuntimeSet,
            ...allowedRetryCandidates,
          ])
          unresolvedDynamicCandidates = unresolvedDynamicCandidates.filter(candidate => retryRuntimeSet?.has(candidate) === true)
        }

        if (retryRuntimeSet && unresolvedDynamicCandidates.length > 0) {
          logger.warn(
            '检测到已提取 WXML 动态类名未完成转译，已回退到完整 runtimeSet 重试: %s -> %O',
            file,
            unresolvedDynamicCandidates,
          )
          transformed = await templateHandler(currentBundleSource, {
            runtimeSet: retryRuntimeSet,
          })
          unresolvedDynamicCandidates = collectUnescapedDynamicCandidates(transformed, retryRuntimeSet)
          if (unresolvedDynamicCandidates.length > 0) {
            logger.warn(
              '已提取 WXML 动态类名在完整 runtimeSet 重试后仍未完成转译: %s -> %O',
              file,
              unresolvedDynamicCandidates,
            )
          }
        }
        transformed = templateTransform?.transform(transformed) ?? transformed
        metrics.html.elapsed += measureElapsed(start)
        metrics.html.transformed++
        onUpdate(file, currentBundleSource, transformed)
        debug('html handle: %s', file)
        return {
          result: transformed,
        }
      },
    })))
}
