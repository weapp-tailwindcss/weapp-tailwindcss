import type { ResolvedConfig } from 'vite'
import type { createViteCssMemory } from '../css-memory'
import type { createViteRuntimeClassSet } from '../runtime-class-set'
import type { SourceCandidateCollector } from '../source-candidates'
import type { createFrameworkSourceScanSession } from './framework-source-scan-session'
import type { createDebug } from '@/debug'
import type { InternalUserDefinedOptions } from '@/types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeTailwindConfigDirectives, normalizeTailwindSourceForGenerator } from '@/generation/directives'
import { isTailwindV4CssEntry } from '@/tailwindcss/v4/css-entries'
import { removeTailwindV4CssSource, upsertTailwindV4CssSource } from '@/tailwindcss/v4/css-sources'
import { isMissingInternalCssSource } from '../plugin-cache'
import { discoverTailwindV4CssEntries, resolveTailwindV4EntriesFromCssCached, resolveViteTailwindV4CssDependencies } from '../source-scan'
import { cleanUrl } from '../utils'

interface FrameworkSourceDiscoveryOptions {
  opts: InternalUserDefinedOptions
  hasInitialTailwindCssRoots: boolean
  shouldOwnTailwindGeneration: boolean
  tailwindcssMajorVersion: number
  weappTailwindcssPackageDir: string
  debug: ReturnType<typeof createDebug>
  sourceCandidateCollector: SourceCandidateCollector
  sourceScanSession: ReturnType<typeof createFrameworkSourceScanSession>
  cssMemory: ReturnType<typeof createViteCssMemory>
  refreshRuntimeState: ReturnType<typeof createViteRuntimeClassSet>['refreshRuntimeState']
  getResolvedConfig: () => ResolvedConfig | undefined
}
/** 来源发现集中在扫描层接入点，所有刷新任务由当前实例持有。 */
export function createFrameworkSourceDiscovery(options: FrameworkSourceDiscoveryOptions) {
  const { opts, hasInitialTailwindCssRoots, shouldOwnTailwindGeneration, tailwindcssMajorVersion, weappTailwindcssPackageDir, debug, sourceCandidateCollector, sourceScanSession, cssMemory, refreshRuntimeState, getResolvedConfig } = options
  const autoCssSourceContent = new Map<string, string>()
  const transientAutoCssSources = new Map()
  const registeredSources = new Set<string>()
  const registrations = new Map<string, object>()
  const pending = new Set<Promise<void>>()
  let autoCssSourcesRefresh: Promise<void> | undefined
  let autoCssSourcesDiscovered = false
  let closing = false
  let disposal: Promise<void> | undefined

  const track = (task: Promise<void>) => {
    pending.add(task)
    void task.finally(() => pending.delete(task)).catch(() => {})
    return task
  }
  const withSource = (file: string, work: (isCurrent: () => boolean) => Promise<void>) => {
    if (closing) {
      return Promise.resolve()
    }
    const lease = cssMemory.captureSource(file)
    const token = {}
    registrations.set(file, token)
    const isCurrent = () => !closing && lease() && registrations.get(file) === token
    return track(Promise.resolve().then(() => work(isCurrent)).finally(() => {
      lease.release()
      if (registrations.get(file) === token) {
        registrations.delete(file)
      }
    }))
  }
  // 已提交的配置变更由实例刷新队列拥有，不能被相同来源的后续扫描取消。
  const refreshSources = (sync = true) => {
    autoCssSourcesRefresh = (autoCssSourcesRefresh ?? Promise.resolve()).catch(() => {}).then(async () => {
      if (closing) {
        return
      }
      await refreshRuntimeState(true)
      if (sync && !closing) {
        await sourceScanSession.sync({ force: true })
      }
    })
    return autoCssSourcesRefresh
  }
  const syncTailwindCssSourceCandidates = async (id: string, css: string, isCurrent: () => boolean) => {
    if (!isCurrent() || (tailwindcssMajorVersion === 4 && isMissingInternalCssSource(cleanUrl(id), weappTailwindcssPackageDir))) {
      return
    }
    await sourceCandidateCollector.syncCss(id, css)
    if (isCurrent()) {
      sourceScanSession.cacheCurrent()
    }
  }
  const registerAutoCssSource = (id: string, css: string, registrationOptions: {
    refresh?: boolean | undefined
  } = {}) => {
    const file = cleanUrl(id)
    if (!shouldOwnTailwindGeneration || !path.isAbsolute(file) || !isTailwindV4CssEntry(file) || isMissingInternalCssSource(file, weappTailwindcssPackageDir)) {
      return Promise.resolve()
    }
    const sourceFile = path.normalize(file)
    const sourceBase = path.dirname(sourceFile)
    const sourceCss = normalizeTailwindSourceForGenerator(normalizeTailwindConfigDirectives(css, sourceBase), { importFallback: true })
    if (autoCssSourceContent.get(sourceFile) === sourceCss) {
      return Promise.resolve()
    }
    return withSource(sourceFile, async (isCurrent) => {
      if (!isCurrent()) {
        return
      }
      await syncTailwindCssSourceCandidates(sourceFile, sourceCss, isCurrent)
      if (!isCurrent()) {
        return
      }
      cssMemory.refreshRememberedCssSourceBySourceFile(sourceFile, sourceCss)
      const transientSource = { file: sourceFile, base: sourceBase, css: sourceCss, dependencies: [] as string[] }
      if (!hasInitialTailwindCssRoots) {
        transientSource.dependencies = await resolveViteTailwindV4CssDependencies(sourceCss, sourceBase)
        if (!isCurrent()) {
          return
        }
      }
      autoCssSourceContent.set(sourceFile, sourceCss)
      transientAutoCssSources.set(sourceFile, transientSource)
      if (hasInitialTailwindCssRoots) {
        return
      }
      const changed = upsertTailwindV4CssSource(opts, transientSource)
      registeredSources.add(sourceFile)
      if (!changed) {
        return
      }
      sourceScanSession.invalidate()
      debug('detected tailwindcss v4 css source from vite css module: %s', sourceFile)
      if (registrationOptions.refresh !== false) {
        await refreshSources()
      }
    })
  }
  const discoverAndRegisterAutoCssSources = () => {
    const resolvedConfig = getResolvedConfig()
    if (closing || !shouldOwnTailwindGeneration || hasInitialTailwindCssRoots || !resolvedConfig?.root) {
      return Promise.resolve()
    }
    return track((async () => {
      const cssEntries = await discoverTailwindV4CssEntries(resolvedConfig.root, resolvedConfig.build?.outDir)
      if (closing) {
        return
      }
      autoCssSourcesDiscovered = true
      let changed = false
      for (const cssEntry of cssEntries) {
        const sourceFile = path.resolve(cssEntry)
        await withSource(sourceFile, async (isCurrent) => {
          const sourceBase = path.dirname(sourceFile)
          const css = await readFile(sourceFile, 'utf8').catch((error) => {
            if (error?.code === 'ENOENT') {
              return undefined
            }
            throw error
          })
          if (!isCurrent() || css === undefined) {
            return
          }
          const sourceCss = normalizeTailwindSourceForGenerator(normalizeTailwindConfigDirectives(css, sourceBase), { importFallback: true })
          if (autoCssSourceContent.get(sourceFile) === sourceCss) {
            return
          }
          await syncTailwindCssSourceCandidates(sourceFile, sourceCss, isCurrent)
          if (!isCurrent()) {
            return
          }
          const resolved = await resolveTailwindV4EntriesFromCssCached(sourceCss, sourceBase)
          if (!isCurrent()) {
            return
          }
          autoCssSourceContent.set(sourceFile, sourceCss)
          changed = upsertTailwindV4CssSource(opts, { file: sourceFile, base: sourceBase, css: sourceCss, dependencies: resolved?.dependencies ?? [] }) || changed
          registeredSources.add(sourceFile)
        })
      }
      if (changed && !closing) {
        sourceScanSession.invalidate()
        await refreshSources(false)
      }
    })())
  }
  const removeSource = (id: string) => {
    const file = path.normalize(cleanUrl(id))
    cssMemory.removeSource(file)
    if (registrations.has(file) || autoCssSourceContent.has(file)) {
      sourceCandidateCollector.remove(file)
      sourceScanSession.cacheCurrent()
    }
    registrations.delete(file)
    autoCssSourceContent.delete(file)
    transientAutoCssSources.delete(file)
    // 仅移除本发现器登记的配置；用户显式根由兼容入口持有。
    if (!registeredSources.delete(file) || !removeTailwindV4CssSource(opts, file)) {
      return Promise.resolve()
    }
    sourceScanSession.invalidate()
    return refreshSources()
  }
  return {
    registerAutoCssSource,
    removeSource,
    transientAutoCssSources,
    discoverAndRegisterAutoCssSources,
    isDiscovered: () => autoCssSourcesDiscovered,
    dispose() {
      disposal ??= (async () => {
        closing = true
        registrations.clear()
        await Promise.allSettled(pending)
        await autoCssSourcesRefresh?.catch(() => {})
        autoCssSourceContent.clear()
        transientAutoCssSources.clear()
        registeredSources.clear()
        autoCssSourcesRefresh = undefined
        autoCssSourcesDiscovered = false
      })()
      return disposal
    },
  }
}
