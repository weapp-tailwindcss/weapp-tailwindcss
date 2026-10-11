import type { HmrContext, ModuleNode } from 'vite'
import type { ViteHmrCssModuleVersionTracker } from '@/bundlers/vite/shared/framework-hmr-module-version'
import process from 'node:process'
import { cleanUrl } from '@/bundlers/vite/utils'

function isStyleModule(mod: ModuleNode) {
  const request = mod.id ?? mod.url
  return typeof request === 'string' && /[?&](?:vue&)?type=style(?:&|$)/.test(request)
}

export function createUniAppXWebLocalStyleBridge(
  isEnabled: () => boolean,
  hmrCssModuleVersions?: ViteHmrCssModuleVersionTracker,
) {
  const rulesByFile = new Map<string, string>()

  return {
    appendToStyle(code: string, id: string) {
      if (!isEnabled()) {
        return code
      }
      const rules = rulesByFile.get(cleanUrl(id))
      return rules ? `${code}\n${rules}` : code
    },
    handleHotUpdate(ctx: HmrContext) {
      if (!isEnabled() || !/\.(?:uvue|nvue)$/i.test(cleanUrl(ctx.file))) {
        return
      }
      const root = ctx.server.config?.root ?? process.cwd()
      const sourceModules = ctx.modules.filter(mod => !isStyleModule(mod))
      const contextStyleModules = ctx.modules.filter(isStyleModule)
      const currentContextStyleModules = hmrCssModuleVersions?.filterModules(contextStyleModules, ctx.timestamp, root)
        ?? contextStyleModules
      const resolvedStyleModules = [...ctx.server.moduleGraph.getModulesByFile?.(ctx.file) ?? []]
        .filter(isStyleModule)
      const currentResolvedStyleModules = hmrCssModuleVersions?.filterModules(resolvedStyleModules, ctx.timestamp, root)
        ?? resolvedStyleModules
      const styleModules = [...new Set([...currentContextStyleModules, ...currentResolvedStyleModules])]
      if (styleModules.length === 0 && sourceModules.length === ctx.modules.length) {
        return
      }
      for (const mod of styleModules) {
        ctx.server.moduleGraph.invalidateModule(mod)
      }
      return [...new Set([...sourceModules, ...styleModules])]
    },
    remember(id: string, rules: string) {
      rulesByFile.set(cleanUrl(id), rules)
    },
  }
}
