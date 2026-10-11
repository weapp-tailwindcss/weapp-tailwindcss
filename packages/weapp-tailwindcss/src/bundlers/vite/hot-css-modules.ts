import type { HmrContext, ModuleNode } from 'vite'
import path from 'node:path'
import process from 'node:process'
import { isSourceStyleRequest } from '../../generation/style-requests'
import { hasSameViteModuleIdentity, resolveViteModuleIdentity } from './module-identity'
import { cleanUrl, slash } from './utils'

async function resolveHotModulesByIds(
  ctx: HmrContext,
  ids: Iterable<string | null | undefined>,
  acceptModule: (mod: ModuleNode) => boolean,
) {
  const modules: ModuleNode[] = []
  const seenModules = new Set<ModuleNode>()
  const seenModuleIds = new Set<string>()
  const seenFileIdentities = new Set<string>()
  const root = ctx.server.config?.root ?? process.cwd()
  const collectModule = (mod: ModuleNode | undefined) => {
    if (mod == null || seenModules.has(mod) || !acceptModule(mod)) {
      return
    }
    seenModules.add(mod)
    modules.push(mod)
  }
  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0) {
      continue
    }
    const identity = resolveViteModuleIdentity(id, root)
    for (const moduleId of identity.lookupIds) {
      if (seenModuleIds.has(moduleId)) {
        continue
      }
      seenModuleIds.add(moduleId)
      collectModule(ctx.server.moduleGraph.getModuleById?.(moduleId))
      if (moduleId.startsWith('/')) {
        collectModule(await ctx.server.moduleGraph.getModuleByUrl?.(moduleId))
      }
    }
    if (seenFileIdentities.has(identity.key)) {
      continue
    }
    seenFileIdentities.add(identity.key)
    for (const file of identity.lookupFiles) {
      for (const mod of ctx.server.moduleGraph.getModulesByFile?.(file) ?? []) {
        collectModule(mod)
      }
    }
  }
  return modules
}

export async function resolveHotTailwindCssModules(
  ctx: HmrContext,
  tailwindRootCssModuleIds: Iterable<string | null | undefined>,
  selectModules?: (modules: ModuleNode[]) => ModuleNode[],
) {
  const root = ctx.server.config?.root ?? process.cwd()
  const outDir = ctx.server.config?.build?.outDir
    ? resolveViteModuleIdentity(ctx.server.config.build.outDir, root)
    : undefined
  const isHotSourceStyleModule = (id: string | null | undefined) => {
    if (typeof id !== 'string' || !isSourceStyleRequest(id)) {
      return false
    }
    const file = cleanUrl(id!)
    if (isRootMiniProgramStyleUrl(file) || (!isAbsoluteFilePath(file) && !file.startsWith('/'))) {
      return false
    }
    if (outDir) {
      const identity = resolveViteModuleIdentity(file, root)
      if (identity.key === outDir.key || identity.key.startsWith(`${outDir.key}/`)) {
        return false
      }
    }
    return true
  }
  const modules = await resolveHotModulesByIds(ctx, tailwindRootCssModuleIds, (mod) => {
    const modId = mod.id ?? mod.url
    return isHotSourceStyleModule(modId)
  })
  const seenHotModules = new Set(modules)
  for (let index = 0; index < modules.length; index++) {
    for (const importer of modules[index]?.importers ?? []) {
      const importerId = importer.id ?? importer.url
      if (!seenHotModules.has(importer) && isHotSourceStyleModule(importerId)) {
        seenHotModules.add(importer)
        modules.push(importer)
      }
    }
  }
  const selectedModules = selectModules?.(modules) ?? modules
  for (const mod of selectedModules) {
    ctx.server.moduleGraph.invalidateModule(mod)
  }
  return selectedModules
}

export async function resolveHotSourceModulesByIds(
  ctx: HmrContext,
  ids: Iterable<string | null | undefined>,
) {
  const root = ctx.server.config?.root ?? process.cwd()
  const sourceIds = new Set<string | null | undefined>(ids)
  for (const id of ids) {
    if (typeof id !== 'string' || !/\.(?:uvue|nvue|vue|tsx?|jsx?)(?:$|[?#])/i.test(id)) {
      continue
    }
    const identity = resolveViteModuleIdentity(id, root)
    for (const lookupId of identity.lookupIds) {
      if (!/[?&]import(?:[=&]|$)/.test(lookupId)) {
        sourceIds.add(`${cleanUrl(lookupId)}?import`)
      }
    }
  }
  return resolveHotModulesByIds(ctx, sourceIds, (mod) => {
    const modId = mod.id ?? mod.url
    return !isSourceStyleRequest(modId)
  })
}

export async function resolveHotSourceModules(ctx: HmrContext) {
  const modules: ModuleNode[] = []
  const seenModules = new Set<ModuleNode>()
  const collectModule = (mod: ModuleNode | undefined) => {
    if (mod == null || seenModules.has(mod)) {
      return
    }
    const modId = mod.id ?? mod.url
    if (isSourceStyleRequest(modId)) {
      return
    }
    seenModules.add(mod)
    modules.push(mod)
  }

  for (const mod of ctx.modules) {
    collectModule(mod)
  }
  for (const mod of await resolveHotSourceModulesByIds(ctx, [ctx.file])) {
    collectModule(mod)
  }

  return modules
}

export function mergeHotModulesByIdentity(root: string, ...groups: ModuleNode[][]) {
  const modules: ModuleNode[] = []
  const seenModules = new Set<ModuleNode>()
  const seenIdentities = new Set<string>()
  for (const mod of groups.flat()) {
    if (seenModules.has(mod)) {
      continue
    }
    const ids = [mod.id, mod.url, mod.file].filter((id): id is string => typeof id === 'string' && id.length > 0)
    const moduleKind = ids.some(isSourceStyleRequest) ? 'style' : 'source'
    const keys = ids.map(id => `${moduleKind}:${resolveViteModuleIdentity(id, root).key}`)
    if (keys.some(key => seenIdentities.has(key))) {
      continue
    }
    seenModules.add(mod)
    keys.forEach(key => seenIdentities.add(key))
    modules.push(mod)
  }
  return modules
}

function resolveModuleHotUrl(mod: ModuleNode) {
  if (typeof mod.url === 'string' && mod.url.length > 0) {
    return mod.url
  }
  if (typeof mod.id === 'string' && mod.id.startsWith('/')) {
    return mod.id
  }
  return undefined
}

function isAbsoluteFilePath(file: string) {
  return path.isAbsolute(file)
    || /^[A-Z]:[\\/]/i.test(file)
    || file.startsWith('\\\\')
}

function normalizeAbsoluteFilePath(file: string) {
  if (/^[A-Z]:[\\/]/i.test(file) || file.startsWith('\\\\')) {
    return slash(path.win32.resolve(file))
  }
  return slash(path.resolve(file))
}

function isRootMiniProgramStyleUrl(file: string) {
  return /^\/[^/]+\.(?:wxss|acss|ttss|qss|jxss|tyss)(?:$|[?#])/i.test(file)
}

function resolveCssHotUrl(id: string, root: string) {
  const suffix = /[?#]/.test(id) ? id.slice(id.search(/[?#]/)) : ''
  const cleanId = cleanUrl(id)
  if (/^\/(?!@fs\/|[A-Z]:)/i.test(cleanId) && !cleanId.startsWith(slash(root))) {
    if (isRootMiniProgramStyleUrl(cleanId)) {
      return undefined
    }
    return `${cleanId}${suffix}`
  }
  const file = resolveViteModuleIdentity(id, root).file ?? cleanId
  if (!isAbsoluteFilePath(file)) {
    return undefined
  }
  const normalizedRoot = normalizeAbsoluteFilePath(root)
  const normalizedFile = normalizeAbsoluteFilePath(file)
  if (!normalizedFile.startsWith(`${normalizedRoot}/`)) {
    return undefined
  }
  return `/${slash(path.relative(normalizedRoot, normalizedFile))}${suffix}`
}

function includesHotModule(modules: ModuleNode[], target: ModuleNode, root: string) {
  const targetUrl = resolveModuleHotUrl(target)
  const targetId = target.id
  return modules.some((mod) => {
    if (mod === target) {
      return true
    }
    return (
      targetUrl !== undefined
      && resolveModuleHotUrl(mod) === targetUrl
    ) || (
      typeof targetId === 'string'
      && targetId.length > 0
      && mod.id === targetId
    ) || [target.id, target.url, target.file].some(targetIdentity => (
      [mod.id, mod.url, mod.file].some(moduleIdentity => hasSameViteModuleIdentity(targetIdentity, moduleIdentity, root))
    ))
  })
}

function includesHotId(modules: ModuleNode[], targetId: string, root: string) {
  return modules.some(mod => [mod.id, mod.url, mod.file].some(moduleId => (
    hasSameViteModuleIdentity(targetId, moduleId, root)
  )))
}

function createSupplementalHotUpdate(hotUrl: string, timestamp: number) {
  return {
    type: 'js-update' as const,
    timestamp,
    path: hotUrl,
    acceptedPath: hotUrl,
    explicitImportRequired: false,
    isWithinCircularImport: false,
  }
}

export function hasSelfAcceptingNonStyleHotModule(modules: ModuleNode[]) {
  return modules.some((mod) => {
    const modId = mod.id ?? mod.url
    return !isSourceStyleRequest(modId) && mod.isSelfAccepting === true
  })
}

export function sendSupplementalCssHotUpdates(
  ctx: HmrContext,
  cssModules: ModuleNode[],
  fallbackCssIds: Iterable<string> = [],
  fallbackSourceIds: Iterable<string> = [],
  handledModules: ModuleNode[] = ctx.modules,
) {
  const seenUrls = new Set<string>()
  const root = ctx.server.config?.root ?? process.cwd()
  const updates: Array<ReturnType<typeof createSupplementalHotUpdate>> = []
  for (const id of fallbackSourceIds) {
    if (includesHotId(handledModules, id, root)) {
      continue
    }
    const hotUrl = resolveCssHotUrl(id, root)
    if (!hotUrl || seenUrls.has(hotUrl)) {
      continue
    }
    seenUrls.add(hotUrl)
    updates.push(createSupplementalHotUpdate(hotUrl, ctx.timestamp))
  }
  for (const id of fallbackCssIds) {
    if (!isSourceStyleRequest(id) || includesHotId(handledModules, id, root)) {
      continue
    }
    const hotUrl = resolveCssHotUrl(id, root)
    if (!hotUrl || seenUrls.has(hotUrl)) {
      continue
    }
    seenUrls.add(hotUrl)
    updates.push(createSupplementalHotUpdate(hotUrl, ctx.timestamp))
  }
  for (const mod of cssModules) {
    if (includesHotModule(handledModules, mod, root)) {
      continue
    }
    const moduleHotUrl = resolveModuleHotUrl(mod)
    const hotUrl = moduleHotUrl ? resolveCssHotUrl(moduleHotUrl, root) : undefined
    if (!hotUrl || seenUrls.has(hotUrl)) {
      continue
    }
    seenUrls.add(hotUrl)
    updates.push(createSupplementalHotUpdate(hotUrl, ctx.timestamp))
  }
  if (updates.length === 0) {
    return
  }
  queueMicrotask(() => {
    ctx.server.ws?.send?.({
      type: 'update',
      updates,
    })
  })
}

export function sendFullReloadForUnresolvedHotUpdate(ctx: HmrContext) {
  ctx.server.ws?.send?.({
    type: 'full-reload',
    path: '*',
    triggeredBy: ctx.file,
  })
}
