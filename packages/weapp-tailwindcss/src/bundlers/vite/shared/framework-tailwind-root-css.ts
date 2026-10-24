import type { ViteCssSourceLease } from '../css-memory/source-lifecycle'
import { hasTailwindRootDirectives } from '@/generation/directives'
import { isSourceStyleRequest } from '../../../generation/style-requests'
import { resolveViteModuleIdentity } from '../module-identity'
import { cleanUrl } from '../utils'

interface FrameworkTailwindRootCssOptions {
  getImportFallback: () => boolean
  refreshRuntimeState: (force: boolean) => Promise<void>
  registerAutoCssSource: (id: string, css: string) => Promise<void>
  shouldOwnTailwindGeneration: boolean
  captureCssSource?: (file: string) => ViteCssSourceLease
  sourceScanSession: {
    invalidate: () => void
    sync: (options?: { force?: boolean }) => Promise<void>
  }
}

export function createFrameworkTailwindRootCss(options: FrameworkTailwindRootCssOptions) {
  const hotSourceByFile = new Map<string, string>()
  const moduleIds = new Set<string>()
  const normalizeSourceFile = (id: string) => resolveViteModuleIdentity(id).key

  const rememberModule = (id: unknown) => {
    if (!options.shouldOwnTailwindGeneration || typeof id !== 'string' || id.length === 0) {
      return
    }
    moduleIds.add(id)
    const identity = resolveViteModuleIdentity(id)
    if (isSourceStyleRequest(identity.cleanId)) {
      for (const moduleId of identity.lookupIds) {
        moduleIds.add(moduleId)
      }
    }
  }

  const register = async (id: string, code: string) => {
    const isCurrent = options.captureCssSource?.(id)
    try {
      if (isCurrent?.() === false) {
        return
      }
      rememberModule(id)
      const hotSource = hotSourceByFile.get(normalizeSourceFile(id))
      await options.registerAutoCssSource(id, hotSource ?? code)
    }
    finally {
      isCurrent?.release()
    }
  }

  const refreshSource = async (id: string, code: string) => {
    const isCurrent = options.captureCssSource?.(id)
    try {
      if (isCurrent?.() === false) {
        return
      }
      const file = cleanUrl(id)
      if (
        !moduleIds.has(id)
        && !moduleIds.has(file)
        && !hasTailwindRootDirectives(code, { importFallback: options.getImportFallback() })
      ) {
        return
      }
      hotSourceByFile.set(normalizeSourceFile(id), code)
      await register(id, code)
      if (isCurrent?.() === false) {
        return
      }
      options.sourceScanSession.invalidate()
      await options.refreshRuntimeState(true)
      if (isCurrent?.() === false) {
        return
      }
      await options.sourceScanSession.sync({ force: true })
    }
    finally {
      isCurrent?.release()
    }
  }

  return {
    removeSource(id: string) {
      const sourceKey = normalizeSourceFile(id)
      hotSourceByFile.delete(sourceKey)
      for (const moduleId of moduleIds) {
        if (normalizeSourceFile(moduleId) === sourceKey) {
          moduleIds.delete(moduleId)
        }
      }
    },
    dispose() {
      hotSourceByFile.clear()
      moduleIds.clear()
    },
    refreshSource,
    register,
    rememberModule,
    moduleIds,
  }
}
