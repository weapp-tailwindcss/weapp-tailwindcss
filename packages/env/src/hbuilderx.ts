import type { HBuilderXRuntimeHints } from './types'
import path from 'node:path'
import process from 'node:process'
import { getProcessEnv } from './environment'

const KNOWN_MAC_HBUILDERX_PLUGIN_DIRS = [
  '/Applications/HBuilderX.app/Contents/HBuilderX/plugins/uniapp-cli-vite',
  '/Applications/HBuilderX.app/Contents/HBuilderX/plugins/uniapp-cli',
] as const

const HBUILDERX_PLUGIN_CWD_RE
  = /[\\/]HBuilderX(?:\.[^\\/]*)?(?:[\\/]Contents[\\/]HBuilderX)?[\\/]plugins[\\/]uniapp-cli(?:-vite)?(?:[\\/]|$)/i
function hasKnownHBuilderXPluginPrefix(normalizedCwd: string) {
  for (const dir of KNOWN_MAC_HBUILDERX_PLUGIN_DIRS) {
    const normalizedDir = path.normalize(dir)
    if (normalizedCwd === normalizedDir || normalizedCwd.startsWith(`${normalizedDir}${path.sep}`)) {
      return true
    }
  }
  return false
}

function matchesHBuilderXPluginCwd(cwd: string) {
  const normalized = path.normalize(cwd)
  if (hasKnownHBuilderXPluginPrefix(normalized)) {
    return true
  }
  return HBUILDERX_PLUGIN_CWD_RE.test(normalized)
}

export function isRunningInHBuilderX(options: HBuilderXRuntimeHints = {}) {
  const env = options.env ?? getProcessEnv()
  const nodePath = 'nodePath' in options ? options.nodePath : env.NODE_PATH
  const nodePathMissing = nodePath == null || nodePath.trim().length === 0
  if (!nodePathMissing) {
    return false
  }
  return matchesHBuilderXPluginCwd(options.cwd ?? process.cwd())
}
