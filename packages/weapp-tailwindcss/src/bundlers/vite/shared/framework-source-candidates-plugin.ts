import type { ModuleNode, Plugin } from 'vite'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createCompilationDependencyChanges, recordCompilationDependencyChanges } from '@/compiler'
import { vitePluginName } from '@/constants'
import { hasTailwindRootDirectives } from '@/generation/directives'
import { isSourceStyleRequest } from '../../../generation/style-requests'
import { shouldCollectTransformedSourceCandidates } from '../css-memory'
import { hasSelfAcceptingNonStyleHotModule, mergeHotModulesByIdentity, resolveHotSourceModules, resolveHotTailwindCssModules, sendFullReloadForUnresolvedHotUpdate, sendSupplementalCssHotUpdates } from '../hot-css-modules'
import { isSourceCandidateRequest } from '../source-candidates'
import { cleanUrl, isCSSRequest } from '../utils'
import { readViteHmrSource } from './hmr-source'

export function createFrameworkSourceCandidatesPlugin(options: any, apply?: Plugin['apply']): Plugin {
  let sourceRevision = 0
  let buildRevision = 0
  let completedRevision = 0
  let previousBuildConsumedTailwindCss = false
  const shouldSkipSourceCandidateState = () => options.shouldSkipSourceCandidateState?.() === true
  const hasDifferentHotModules = (left: ModuleNode[], right: ModuleNode[]) => left.length !== right.length
    || left.some((mod, index) => mod !== right[index])
  const hasTemplateHotSourceModule = (modules: Array<{ id?: string | null, url?: string | null }>) => modules.some((mod) => {
    const request = mod.url ?? mod.id
    return typeof request === 'string'
      && /\.(?:uvue|nvue)(?:\?import)?$/i.test(request)
  })
  const sendSupplementalSourceHotUpdates = (ctx: any, modules: ModuleNode[]) => {
    const root = ctx.server.config?.root ?? process.cwd()
    const relatedModules = modules.flatMap(mod => [mod, ...(mod.importedModules ?? [])])
    const updates = relatedModules
      .filter(mod => !isSourceStyleRequest(mod.id ?? mod.url))
      .map((mod) => {
        let hotPath: string | undefined
        if (typeof mod.id === 'string' && path.isAbsolute(mod.id)) {
          const relative = typeof mod.url === 'string' && mod.url.startsWith('/pages/')
            ? path.relative(path.dirname(root), mod.id)
            : path.relative(root, mod.id)
          if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
            hotPath = `/${relative.split(path.sep).join('/')}`
          }
        }
        hotPath ??= mod.url ?? (typeof mod.id === 'string' && mod.id.startsWith('/') ? mod.id : undefined)
        return hotPath
          ? { acceptedPath: hotPath, explicitImportRequired: false, isWithinCircularImport: false, path: hotPath, timestamp: ctx.timestamp, type: 'js-update' as const }
          : undefined
      })
      .filter((update): update is NonNullable<typeof update> => update !== undefined)
    if (updates.length > 0) {
      ctx.server.ws?.send?.({ type: 'update', updates })
    }
  }
  return {
    name: `${vitePluginName}:source-candidates`,
    ...(apply === undefined ? {} : { apply }),
    enforce: 'pre',
    async load(id) {
      if (
        !options.shouldOwnTailwindGeneration
        || shouldSkipSourceCandidateState()
        || options.isWebOrNativeAppPlatform(options.resolveViteStylePlatform())
        || !isCSSRequest(id)
        || !shouldCollectTransformedSourceCandidates(id)
      ) {
        return
      }
      const file = cleanUrl(id)
      const rawCode = await readFile(file, 'utf8').catch(() => undefined)
      if (typeof rawCode !== 'string') {
        return
      }
      options.rememberOriginalCssLayerSource(id, rawCode)
      const transformedCode = options.transformEarlyMiniProgramCss(rawCode)
      if (transformedCode === rawCode) {
        return
      }
      options.cssMemory.rememberKnownSfcSource(id, transformedCode)
      return transformedCode
    },
    transform: {
      order: 'pre',
      async handler(code, id) {
        if (shouldSkipSourceCandidateState()) {
          return
        }
        if (options.hasUserCssLayerBlocks(code)) {
          options.rememberOriginalCssLayerSource(id, code)
        }
        let transformedCode = code
        if (options.shouldOwnTailwindGeneration && !options.resolveCurrentGeneratorBranch().isWeb && isCSSRequest(id)) {
          transformedCode = options.transformEarlyMiniProgramCss(code)
        }
        const shouldReturnTransformedCode = transformedCode !== code
        if (options.shouldOwnTailwindGeneration && shouldCollectTransformedSourceCandidates(id)) {
          options.cssMemory.rememberKnownSfcSource(id, transformedCode)
          if (isCSSRequest(id) && hasTailwindRootDirectives(transformedCode, { importFallback: options.resolveCurrentGeneratorOptions().importFallback })) {
            options.rememberTailwindRootCssModule(id)
          }
        }
        if (!options.shouldOwnTailwindGeneration || shouldSkipSourceCandidateState() || options.collectSourceCandidates === false || !isSourceCandidateRequest(id) || !shouldCollectTransformedSourceCandidates(id)) {
          return shouldReturnTransformedCode ? { code: transformedCode, map: null } : undefined
        }
        return options.hmrTimingRecorder.measure('sourceCandidates.transform', async () => {
          options.invalidateRecordedGeneratorCandidates()
          const file = cleanUrl(id)
          if (!options.sourceScanSession.matches(file)) {
            options.sourceCandidateCollector.remove(file)
            options.sourceScanSession.cacheCurrent()
            return shouldReturnTransformedCode ? { code: transformedCode, map: null } : undefined
          }
          await options.sourceCandidateCollector.merge(id, transformedCode)
          options.sourceScanSession.cacheCurrent()
          return shouldReturnTransformedCode ? { code: transformedCode, map: null } : undefined
        }, { emit: false })
      },
    },
    async watchChange(id, change) {
      if (shouldSkipSourceCandidateState()) {
        return
      }
      // Web 样式依赖 transform 产物；小程序由 bundle 阶段统一重建，无需重复转换 CSS 入口。
      if (options.shouldOwnTailwindGeneration && options.resolveCurrentGeneratorBranch?.().isWeb === true && (isSourceCandidateRequest(id) || options.sourceScanSession.isDependency(id))) {
        sourceRevision++
      }
      recordCompilationDependencyChanges(options.runtimeState, createCompilationDependencyChanges([path.resolve(cleanUrl(id))]))
      await options.hmrTimingRecorder.measure('sourceCandidates.watchChange', async () => {
        if (options.shouldOwnTailwindGeneration && options.collectSourceCandidates !== false && isSourceCandidateRequest(id)) {
          options.invalidateRecordedGeneratorCandidates()
        }
        if (options.sourceScanSession.isDependency(id)) {
          options.sourceScanSession.invalidate()
        }
        if (change.event === 'delete') {
          const file = cleanUrl(id)
          if (typeof options.sourceScanSession.queueChangedFile === 'function') {
            options.sourceScanSession.queueChangedFile({ event: 'delete', id: file })
            queueMicrotask(() => void options.sourceScanSession.flushChangedFiles())
          }
          else {
            const sourceCandidateChange = options.sourceCandidateCollector.remove(file)
            options.sourceScanSession.cacheCurrent()
            options.hmrCandidateState.apply(options.hmrCandidateState.createChange(file, sourceCandidateChange, {
              runtimeAffecting: options.sourceScanSession.isDependency(file),
            }))
          }
          return
        }
        const changedSource = options.shouldOwnTailwindGeneration && isSourceCandidateRequest(id) && isCSSRequest(id)
          ? await readFile(cleanUrl(id), 'utf8').catch(() => undefined)
          : undefined
        if (typeof changedSource === 'string') {
          options.rememberOriginalCssLayerSource(id, changedSource)
          await options.refreshTailwindRootCssSource(id, changedSource)
        }
        if (typeof options.sourceScanSession.queueChangedFile === 'function') {
          options.sourceScanSession.queueChangedFile({ event: change.event === 'create' ? 'create' : 'update', id, source: changedSource })
          queueMicrotask(() => void options.sourceScanSession.flushChangedFiles())
        }
        else {
          await options.sourceScanSession.syncChangedFile(id, changedSource)
        }
      }, { emit: false })
    },
    handleHotUpdate: {
      order: 'post',
      async handler(ctx) {
        if (shouldSkipSourceCandidateState()) {
          return
        }
        recordCompilationDependencyChanges(options.runtimeState, createCompilationDependencyChanges([path.resolve(cleanUrl(ctx.file))]))
        return options.hmrTimingRecorder.measure('sourceCandidates.handleHotUpdate', async () => {
          const isSourceCandidateHotUpdate = options.shouldOwnTailwindGeneration && options.collectSourceCandidates !== false && isSourceCandidateRequest(ctx.file)
          if (isSourceCandidateHotUpdate && isSourceStyleRequest(ctx.file)) {
            for (const mod of ctx.modules) {
              for (const id of [mod.id, mod.url, mod.file]) {
                if (typeof id === 'string' && id.length > 0) {
                  options.rememberTailwindRootCssModule(id)
                }
              }
            }
          }
          const hotSource = isSourceCandidateHotUpdate && typeof ctx.read === 'function'
            ? await readViteHmrSource(ctx)
            : undefined
          if (typeof hotSource === 'string' && isCSSRequest(ctx.file)) {
            options.rememberOriginalCssLayerSource(ctx.file, hotSource)
            await options.refreshTailwindRootCssSource(ctx.file, hotSource)
          }
          const sourceCandidateChange = typeof options.sourceScanSession.queueChangedFile === 'function'
            ? (options.sourceScanSession.queueChangedFile({ event: 'update', id: ctx.file, source: hotSource }), await options.sourceScanSession.flushChangedFiles()).get(cleanUrl(ctx.file))
            : await options.sourceScanSession.syncChangedFile(ctx.file, hotSource)
          options.sourceScanSession.consumeHotUpdateChange(ctx.file)
          const isWebLikeHotUpdate = options.isCurrentWebLikeStylePlatform()
          let canUseHmrCandidateAppend = false
          if (isSourceCandidateHotUpdate) {
            options.invalidateRecordedGeneratorCandidates()
            const preserveDeletedCssInHmr = options.resolveCurrentGeneratorOptions().hmr.preserveDeletedCss
            canUseHmrCandidateAppend = preserveDeletedCssInHmr
              && !isSourceStyleRequest(ctx.file)
              && sourceCandidateChange !== undefined
              && !sourceCandidateChange.runtimeAffecting
            if (!canUseHmrCandidateAppend) {
              if (sourceCandidateChange === undefined) {
                options.hmrCandidateState.clear()
                if (!preserveDeletedCssInHmr && !isSourceStyleRequest(ctx.file)) {
                  options.hmrCandidateState.queueFullRegeneration()
                }
              }
              if (isWebLikeHotUpdate) {
                await options.refreshRuntimeStateForAutoCssSources?.(true)
                await options.sourceScanSession.sync({ force: true })
              }
            }
          }
          if (isSourceCandidateHotUpdate) {
            await options.sourceScanSession.waitForPendingSyncs()
          }
          if (isSourceCandidateHotUpdate && !isSourceStyleRequest(ctx.file)) {
            options.hmrCandidateState.reconcileRuntimeCandidates(
              ctx.file,
              options.sourceCandidateCollector.values(),
              options.tailwindRootCssModuleIds,
            )
          }
          const hotTailwindCssModuleIds = isSourceStyleRequest(ctx.file)
            ? [ctx.file]
            : options.tailwindRootCssModuleIds
          const hotRoot = ctx.server.config?.root ?? process.cwd()
          const cssModules = await resolveHotTailwindCssModules(
            ctx,
            hotTailwindCssModuleIds,
            options.hmrCssModuleVersions
              ? modules => options.hmrCssModuleVersions.filterModules(modules, ctx.timestamp, hotRoot)
              : undefined,
          )
          const sourceModules = isSourceCandidateHotUpdate && !isSourceStyleRequest(ctx.file)
            ? await resolveHotSourceModules(ctx)
            : ctx.modules
          if (isWebLikeHotUpdate && isSourceCandidateHotUpdate && !isSourceStyleRequest(ctx.file)) {
            if (!/\.(?:uvue|nvue)$/i.test(cleanUrl(ctx.file))) {
              sendSupplementalSourceHotUpdates(ctx, sourceModules)
            }
            if (sourceModules.some((mod) => {
              const id = mod.id ?? mod.url
              return typeof id === 'string' && /[?&]macro=true(?:&|$)/.test(id) === false
                && typeof mod.url === 'string' && mod.url.startsWith('/pages/')
                && /\.vue(?:$|[?#])/i.test(id)
            })) {
              queueMicrotask(() => sendFullReloadForUnresolvedHotUpdate(ctx))
              return []
            }
          }
          const hasHmrCandidateAppend = options.hmrCandidateState.hasPendingCandidateAppend()
            || (canUseHmrCandidateAppend && sourceCandidateChange !== undefined && sourceCandidateChange.addedCandidates.size > 0)
          if (
            isSourceCandidateHotUpdate
            && !isSourceStyleRequest(ctx.file)
            && !hasHmrCandidateAppend
            && !isWebLikeHotUpdate
            && (
              (!hasSelfAcceptingNonStyleHotModule(sourceModules) && cssModules.length === 0)
              || (cssModules.length > 0 && options.isUniViteProject())
            )
          ) {
            sendFullReloadForUnresolvedHotUpdate(ctx)
            return []
          }
          if (
            isWebLikeHotUpdate
            && isSourceCandidateHotUpdate
            && !isSourceStyleRequest(ctx.file)
            && sourceModules.some(mod => options.isNuxtPageHotModule?.(mod.id ?? mod.url))
          ) {
            sendFullReloadForUnresolvedHotUpdate(ctx)
            return []
          }
          if (
            isWebLikeHotUpdate
            && isSourceCandidateHotUpdate
            && !isSourceStyleRequest(ctx.file)
            && /\.(?:uvue|nvue)$/i.test(cleanUrl(ctx.file))
            && !hasTemplateHotSourceModule(sourceModules)
          ) {
            sendFullReloadForUnresolvedHotUpdate(ctx)
            return []
          }
          const shouldSendSupplementalCssHotUpdates = !(
            isWebLikeHotUpdate
            && isSourceCandidateHotUpdate
            && !isSourceStyleRequest(ctx.file)
            && sourceCandidateChange !== undefined
            && (
              options.resolveCurrentGeneratorOptions().hmr.preserveDeletedCss
              && !sourceCandidateChange.runtimeAffecting
              && sourceCandidateChange.addedCandidates.size === 0
              && sourceCandidateChange.removedCandidates.size > 0
            )
          )
          const supplementalCssFallbackIds = new Set([
            ...options.tailwindRootCssModuleIds,
            ...options.viteProcessedCssSourceFiles,
          ])
          const currentSupplementalCssFallbackIds = options.hmrCssModuleVersions?.filterIds(
            supplementalCssFallbackIds,
            ctx.timestamp,
            hotRoot,
          ) ?? supplementalCssFallbackIds
          if (options.hmrCandidateState.hasPendingChange()) {
            options.hmrCandidateState.armTargets(cssModules, currentSupplementalCssFallbackIds)
          }
          if (shouldSendSupplementalCssHotUpdates && cssModules.length === 0) {
            sendSupplementalCssHotUpdates(ctx, [], currentSupplementalCssFallbackIds)
          }
          if (isWebLikeHotUpdate && isSourceCandidateHotUpdate && !isSourceStyleRequest(ctx.file)) {
            return cssModules.length > 0
              ? mergeHotModulesByIdentity(hotRoot, sourceModules, cssModules)
              : hasDifferentHotModules(sourceModules, ctx.modules) ? sourceModules : undefined
          }
          if (isSourceCandidateHotUpdate && !isSourceStyleRequest(ctx.file) && cssModules.length > 0) {
            return mergeHotModulesByIdentity(hotRoot, sourceModules, cssModules)
          }
          return cssModules.length > 0 ? mergeHotModulesByIdentity(hotRoot, ctx.modules, cssModules) : undefined
        }, { emit: false })
      },
    },
    closeBundle() {
      options.hmrCssModuleVersions?.clear()
    },
    async buildStart() {
      buildRevision = sourceRevision
      if (shouldSkipSourceCandidateState()) {
        return
      }
      await options.hmrTimingRecorder.measure('sourceCandidates.buildStart', options.prepareTailwindGeneration, { emit: false })
      // 已确认的消费图在下一轮开始时补回扫描监听，覆盖框架绕过缓存模块钩子的增量路径。
      if (previousBuildConsumedTailwindCss) {
        for (const file of options.sourceScanSession.getWatchFiles?.() ?? []) {
          this.addWatchFile(file)
        }
      }
    },
    async moduleParsed(module) {
      if (shouldSkipSourceCandidateState()) {
        return
      }
      // 仅让实际消费 Tailwind CSS 的构建图监听候选；uni-app 的空 nvue 图不能抢先触发设备同步。
      const roots = options.tailwindRootCssModuleIds as Set<string> | undefined
      if (roots?.has(module.id)) {
        await options.prepareTailwindGeneration()
        // 在 Rollup 3 允许登记依赖的阶段，刷新 transform 后可能改变的来源范围。
        for (const file of options.sourceScanSession.getWatchFiles?.() ?? []) {
          this.addWatchFile(file)
        }
      }
    },
    async shouldTransformCachedModule(module) {
      if (!shouldSkipSourceCandidateState() && options.tailwindRootCssModuleIds?.has(module.id)) {
        await options.prepareTailwindGeneration()
        for (const file of options.sourceScanSession.getWatchFiles?.() ?? []) {
          this.addWatchFile(file)
        }
        // 来源依赖可能不在 CSS 的 import 图中；revision 改变时让 Rollup 重新执行入口 transform。
        if (buildRevision !== completedRevision) {
          return true
        }
      }
      return null
    },
    buildEnd(error) {
      if (!error) {
        completedRevision = buildRevision
      }
    },
    async generateBundle(...args: any[]) {
      if (shouldSkipSourceCandidateState()) {
        return
      }
      const roots = options.tailwindRootCssModuleIds as Set<string> | undefined
      previousBuildConsumedTailwindCss = Boolean(roots && [...roots].some(id => this.getModuleInfo?.(id) != null))
      return options.preGenerateBundleHook?.apply(this, args)
    },
  }
}
