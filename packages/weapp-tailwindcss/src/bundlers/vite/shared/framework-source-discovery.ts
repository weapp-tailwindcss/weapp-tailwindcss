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
import { upsertTailwindV4CssSource } from '@/tailwindcss/v4/css-sources'
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
  let autoCssSourcesRefresh: Promise<void> | undefined
  let autoCssSourcesDiscovered = false
  const syncTailwindCssSourceCandidates = async (id: string, css: string) => {
    if (tailwindcssMajorVersion === 4 && isMissingInternalCssSource(cleanUrl(id), weappTailwindcssPackageDir)) {
      return
    }
    await sourceCandidateCollector.syncCss(id, css)
    sourceScanSession.cacheCurrent()
  }
  const registerAutoCssSource = async (id: string, css: string, options2: {
    refresh?: boolean | undefined
  } = {}) => {
    if (!shouldOwnTailwindGeneration) {
      return
    }
    const file = cleanUrl(id)
    if (!path.isAbsolute(file)) {
      return
    }
    if (!isTailwindV4CssEntry(file)) {
      return
    }
    if (isMissingInternalCssSource(file, weappTailwindcssPackageDir)) {
      return
    }
    const sourceFile = path.normalize(file)
    const sourceBase = path.dirname(sourceFile)
    const sourceCss = normalizeTailwindSourceForGenerator(normalizeTailwindConfigDirectives(css, sourceBase), { importFallback: true })
    if (autoCssSourceContent.get(sourceFile) === sourceCss) {
      return
    }
    autoCssSourceContent.set(sourceFile, sourceCss)
    await syncTailwindCssSourceCandidates(sourceFile, sourceCss)
    cssMemory.refreshRememberedCssSourceBySourceFile(sourceFile, sourceCss)
    const transientSource = { file: sourceFile, base: sourceBase, css: sourceCss, dependencies: [] as string[] }
    if (hasInitialTailwindCssRoots) {
      transientAutoCssSources.set(sourceFile, transientSource)
      return
    }
    const dependencies = await resolveViteTailwindV4CssDependencies(sourceCss, sourceBase)
    transientSource.dependencies = dependencies
    transientAutoCssSources.set(sourceFile, transientSource)
    const changed = upsertTailwindV4CssSource(opts, { file: sourceFile, base: sourceBase, css: sourceCss, dependencies })
    if (!changed) {
      return
    }
    sourceScanSession.invalidate()
    debug('detected tailwindcss v4 css source from vite css module: %s', sourceFile)
    if (options2.refresh === false) {
      return
    }
    autoCssSourcesRefresh = (autoCssSourcesRefresh ?? Promise.resolve()).catch(() => {}).then(async () => {
      await refreshRuntimeState(true)
      await sourceScanSession.sync({ force: true })
    })
    await autoCssSourcesRefresh
  }
  const discoverAndRegisterAutoCssSources = async () => {
    const resolvedConfig = getResolvedConfig()
    if (!shouldOwnTailwindGeneration || hasInitialTailwindCssRoots || !resolvedConfig?.root) {
      return
    }
    const cssEntries = await discoverTailwindV4CssEntries(resolvedConfig.root, resolvedConfig.build?.outDir)
    autoCssSourcesDiscovered = true
    let changed = false
    for (const cssEntry of cssEntries) {
      const sourceFile = path.resolve(cssEntry)
      const sourceBase = path.dirname(sourceFile)
      const sourceCss = normalizeTailwindSourceForGenerator(normalizeTailwindConfigDirectives(await readFile(sourceFile, 'utf8'), sourceBase), { importFallback: true })
      if (autoCssSourceContent.get(sourceFile) === sourceCss) {
        continue
      }
      autoCssSourceContent.set(sourceFile, sourceCss)
      await syncTailwindCssSourceCandidates(sourceFile, sourceCss)
      const resolved = await resolveTailwindV4EntriesFromCssCached(sourceCss, sourceBase)
      changed = upsertTailwindV4CssSource(opts, { file: sourceFile, base: sourceBase, css: sourceCss, dependencies: resolved?.dependencies ?? [] }) || changed
    }
    if (!changed) {
      return
    }
    sourceScanSession.invalidate()
    await refreshRuntimeState(true)
  }
  return {
    registerAutoCssSource,
    transientAutoCssSources,
    discoverAndRegisterAutoCssSources,
    isDiscovered: () => autoCssSourcesDiscovered,
    async dispose() {
      await autoCssSourcesRefresh?.catch(() => { })
      autoCssSourceContent.clear()
      transientAutoCssSources.clear()
      autoCssSourcesRefresh = undefined
      autoCssSourcesDiscovered = false
    },
  }
}
