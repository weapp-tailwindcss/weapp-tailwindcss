import type { HmrContext } from 'vite'
import { hasSelfAcceptingNonStyleHotModule, resolveHotSourceModules, resolveHotSourceModulesByIds, resolveHotTailwindCssModules, sendFullReloadForUnresolvedHotUpdate } from '@/bundlers/vite/hot-css-modules'

interface CreateUniAppXNativeHmrReloaderOptions {
  ensureRuntimeClassSet: (force?: boolean) => Promise<Set<string>>
  isNativeAppBuildTarget: (id?: string) => boolean
  localStyleModuleIds: Iterable<string>
  syncSourceCandidates?: ((ctx: HmrContext) => Promise<void>) | undefined
  tailwindRootCssModuleIds: Iterable<string>
  viteProcessedCssSourceFiles: Iterable<string>
}

export function createUniAppXNativeHmrReloader(
  options: CreateUniAppXNativeHmrReloaderOptions,
) {
  let previousRuntimeClassSet: Set<string> | undefined

  function remember(runtimeClassSet: Set<string>) {
    previousRuntimeClassSet = new Set(runtimeClassSet)
    return runtimeClassSet
  }

  async function refreshBaseline() {
    return remember(await options.ensureRuntimeClassSet())
  }

  async function handleHotUpdate(ctx: HmrContext) {
    if (!options.isNativeAppBuildTarget(ctx.file)) {
      return
    }
    await options.syncSourceCandidates?.(ctx)
    const currentRuntimeClassSet = await options.ensureRuntimeClassSet()
    const hasRuntimeClassChange = previousRuntimeClassSet !== undefined
      && (
        currentRuntimeClassSet.size !== previousRuntimeClassSet.size
        || [...currentRuntimeClassSet].some(candidate => !previousRuntimeClassSet!.has(candidate))
      )
    remember(currentRuntimeClassSet)
    const cssModules = ctx.server?.moduleGraph
      ? await resolveHotTailwindCssModules(ctx, new Set([
          ...options.tailwindRootCssModuleIds,
          ...options.viteProcessedCssSourceFiles,
        ]))
      : []
    const sourceModules = ctx.server?.moduleGraph ? await resolveHotSourceModules(ctx) : ctx.modules ?? []
    const localStyleModules = hasRuntimeClassChange && ctx.server?.moduleGraph
      ? await resolveHotSourceModulesByIds(ctx, options.localStyleModuleIds)
      : []
    for (const mod of new Set([...sourceModules, ...localStyleModules])) {
      ctx.server?.moduleGraph?.invalidateModule(mod)
    }
    const modules = [...new Set([...sourceModules, ...localStyleModules, ...cssModules])]
    const canAcceptUpdate = hasSelfAcceptingNonStyleHotModule([...sourceModules, ...localStyleModules]) || cssModules.length > 0
    if (hasRuntimeClassChange && !canAcceptUpdate) {
      sendFullReloadForUnresolvedHotUpdate(ctx)
      return []
    }
    return modules.length > 0 ? modules : undefined
  }

  return {
    handleHotUpdate,
    refreshBaseline,
    remember,
  }
}
