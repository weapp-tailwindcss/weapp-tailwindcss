import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import path from 'node:path'
import { cleanUrl } from '../utils'

export function collectConfiguredCssEntries(options: UserDefinedOptions) {
  const runtimeCssEntries = options.tailwindcssRuntimeOptions?.tailwindcss?.v4?.cssEntries
  const entries = [
    ...(Array.isArray(options.cssEntries) ? options.cssEntries : []),
    ...(Array.isArray(options.tailwindcss?.v4?.cssEntries) ? options.tailwindcss.v4.cssEntries : []),
    ...(Array.isArray(runtimeCssEntries) ? runtimeCssEntries : []),
  ].filter(item => typeof item === 'string' && item.length > 0)
  return entries.length > 0 ? [...new Set(entries)] : void 0
}

export function inferPlatformFromOutDir(outDir: string | undefined) {
  const segment = outDir ? path.basename(path.normalize(outDir)) : void 0
  if (!segment) {
    return void 0
  }
  const normalized = segment.trim().toLowerCase()
  if (normalized === 'h5' || normalized === 'web' || normalized === 'app' || normalized === 'app-plus' || normalized.startsWith('app-') || normalized.startsWith('mp-') || normalized.startsWith('quickapp-webview')) {
    return normalized
  }
  return void 0
}

export function isWebOrNativeAppPlatform(platform: string | undefined) {
  return platform === 'h5' || platform === 'web' || platform?.startsWith('web-') === true || platform === 'app' || platform === 'app-plus' || platform?.startsWith('app-') === true
}

export function isInternalUserDefinedOptions(options: UserDefinedOptions | InternalUserDefinedOptions): options is InternalUserDefinedOptions {
  return typeof options.onLoad === 'function' && typeof options.mainCssChunkMatcher === 'function' && 'tailwindRuntime' in options && typeof options.tailwindRuntime === 'object' && 'refreshTailwindcssRuntime' in options && typeof options.refreshTailwindcssRuntime === 'function'
}

export function isNuxtPageHotModule(id: unknown) {
  if (typeof id !== 'string') {
    return false
  }
  const cleanId = cleanUrl(id).replace(/%2F/gi, '/')
  if (cleanId.includes('virtual:nuxt:') && /(?:^|\/)routes\.mjs$/.test(cleanId)) {
    return true
  }
  if (!/[?&]macro=true(?:&|$)/.test(id)) {
    return false
  }
  return cleanId.includes('/pages/') && /\.(?:vue|tsx?|jsx?)$/.test(cleanId)
}
