import type { Plugin } from 'vite'
import process from 'node:process'
import { vitePluginName } from '@/constants'
import { hasUserCssLayerBlocks } from '@/generation/user-css'
import { mergeHotModulesByIdentity, resolveHotTailwindCssModules } from '../hot-css-modules'
import { isSourceCandidateRequest } from '../source-candidates'
import { isCSSRequest } from '../utils'

export function createFrameworkSourceCandidatesPluginForCssOnly(options: any): Plugin {
  return {
    name: `${vitePluginName}:source-candidates`,
    enforce: 'pre',
    async transform(code, id) {
      if (!options.sourceCandidateCollector || !isSourceCandidateRequest(id)) {
        return
      }
      options.cssMemory.rememberKnownSfcSource(id, code)
      if (isCSSRequest(id) && hasUserCssLayerBlocks(code)) {
        options.rememberTailwindRootCssModule(id)
      }
      await options.sourceCandidateCollector.merge(id, code)
    },
    async watchChange(id) {
      options.invalidateRecordedGeneratorCandidates()
      options.sourceScanSession.invalidate()
      await options.sourceScanSession.syncChangedFile(id)
    },
    async handleHotUpdate(ctx) {
      options.invalidateRecordedGeneratorCandidates()
      await options.sourceScanSession.syncChangedFile(ctx.file, await ctx.read?.())
      await options.sourceScanSession.waitForPendingSyncs()
      await options.refreshRuntimeStateForAutoCssSources(true)
      const root = ctx.server.config?.root ?? process.cwd()
      const cssModules = await resolveHotTailwindCssModules(
        ctx,
        options.tailwindRootCssModuleIds,
        modules => options.hmrCssModuleVersions.filterModules(modules, ctx.timestamp, root),
      )
      return cssModules.length > 0
        ? mergeHotModulesByIdentity(root, ctx.modules, cssModules)
        : undefined
    },
  }
}
