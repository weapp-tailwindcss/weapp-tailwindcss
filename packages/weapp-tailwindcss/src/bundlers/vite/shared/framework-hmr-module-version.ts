import type { ModuleNode, Plugin } from 'vite'
import process from 'node:process'
import { isSourceStyleRequest } from '../../../generation/style-requests'
import { sendSupplementalCssHotUpdates } from '../hot-css-modules'
import { resolveViteModuleIdentity } from '../module-identity'

export interface ViteHmrCssModuleVersionTracker {
  clear: () => void
  filterIds: (ids: Iterable<string>, timestamp: number, root: string) => string[]
  filterModules: (modules: ModuleNode[], timestamp: number, root: string) => ModuleNode[]
  reserveRefreshTimestamp: (modules: ModuleNode[], timestamp: number, root: string) => number
}

function acceptVersion(versions: Map<string, number>, keys: string[], timestamp: number) {
  if (keys.some(key => (versions.get(key) ?? 0) > timestamp)) {
    return false
  }
  for (const key of keys) {
    versions.set(key, Math.max(versions.get(key) ?? 0, timestamp))
  }
  return true
}

export function createViteHmrCssModuleVersionTracker(): ViteHmrCssModuleVersionTracker {
  const versions = new Map<string, number>()
  const keysForId = (id: string, root: string) => [resolveViteModuleIdentity(id, root).key]
  const keysForModule = (mod: ModuleNode, root: string) => [...new Set(
    [mod.id, mod.url, mod.file]
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .flatMap(id => keysForId(id, root)),
  )]

  return {
    clear() {
      versions.clear()
    },
    filterIds(ids, timestamp, root) {
      return [...ids].filter(id => acceptVersion(versions, keysForId(id, root), timestamp))
    },
    filterModules(modules, timestamp, root) {
      return modules.filter((mod) => {
        const keys = keysForModule(mod, root)
        return keys.length === 0 || acceptVersion(versions, keys, timestamp)
      })
    },
    reserveRefreshTimestamp(modules, timestamp, root) {
      const moduleKeys = modules.flatMap(mod => keysForModule(mod, root))
      const latestTimestamp = moduleKeys.reduce(
        (latest, key) => Math.max(latest, versions.get(key) ?? 0),
        0,
      )
      const refreshTimestamp = Math.max(Date.now(), timestamp + 1, latestTimestamp + 1)
      for (const key of moduleKeys) {
        versions.set(key, refreshTimestamp)
      }
      return refreshTimestamp
    },
  }
}

export function createViteHmrCssModuleVersionFilterPlugin(
  tracker: ViteHmrCssModuleVersionTracker,
): Plugin {
  return {
    name: 'weapp-tailwindcss:hmr-css-module-version',
    enforce: 'post',
    handleHotUpdate: {
      order: 'post',
      handler(ctx) {
        const styleModules = ctx.modules.filter((mod) => {
          const request = mod.id ?? mod.url
          return isSourceStyleRequest(request)
        })
        if (styleModules.length === 0) {
          return
        }
        const root = ctx.server.config?.root ?? process.cwd()
        const currentStyleModules = tracker.filterModules(styleModules, ctx.timestamp, root)
        if (currentStyleModules.length === styleModules.length) {
          return
        }
        const droppedStyleModules = styleModules.filter(mod => !currentStyleModules.includes(mod))
        for (const mod of droppedStyleModules) {
          ctx.server.moduleGraph.invalidateModule(mod)
        }
        const refreshTimestamp = tracker.reserveRefreshTimestamp(
          droppedStyleModules,
          ctx.timestamp,
          root,
        )
        sendSupplementalCssHotUpdates(
          { ...ctx, timestamp: refreshTimestamp },
          droppedStyleModules,
          [],
          [],
          [],
        )
        const sourceModules = ctx.modules.filter(mod => !styleModules.includes(mod))
        return [...sourceModules, ...currentStyleModules]
      },
    },
  }
}
