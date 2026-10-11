import { hasUserCssLayerBlocks } from '@/generation/user-css'
import { isSourceStyleRequest } from '../../../generation/style-requests'
import { normalizeVitePersistentCacheKey } from '../plugin-cache'
import { cleanUrl } from '../utils'

interface CandidateDelta {
  addedCandidates: Set<string>
  removedCandidates: Set<string>
}

export interface ViteSourceCandidateChange extends CandidateDelta {
  file: string
  runtimeAffecting: boolean
}

interface ViteHmrModule {
  file?: string | null
  id?: string | null
  url?: string | null
}

interface ViteHmrGeneratorOptions {
  hmr: {
    preserveDeletedCss: boolean
  }
  target: string
}

interface CreateViteHmrCandidateStateOptions {
  cleanGeneratedCssByFile: Map<string, string>
  generatedClassSetByFile: Map<string, Set<string>>
  getCommand: () => string | undefined
  getGeneratorOptions: () => ViteHmrGeneratorOptions
  isRuntimeAffectingSource?: (file: string) => boolean
}

export function createViteHmrCandidateState(options: CreateViteHmrCandidateStateOptions) {
  let pendingChange: ViteSourceCandidateChange | undefined
  let pendingCssTargetFiles: Set<string> | undefined
  let pendingTargetsArmed = false
  let pendingFullRegeneration = false

  const normalizeCssTargetFile = (file: string) => normalizeVitePersistentCacheKey(cleanUrl(file))

  const clear = () => {
    pendingChange = undefined
    pendingCssTargetFiles = undefined
    pendingTargetsArmed = false
    pendingFullRegeneration = false
  }

  const queueFullRegeneration = () => {
    pendingChange = undefined
    pendingCssTargetFiles = undefined
    pendingTargetsArmed = false
    pendingFullRegeneration = true
  }

  const queueChange = (change: ViteSourceCandidateChange) => {
    if (pendingFullRegeneration) {
      return
    }
    pendingFullRegeneration = false
    if (!pendingChange) {
      pendingChange = {
        file: change.file,
        runtimeAffecting: change.runtimeAffecting,
        addedCandidates: new Set(change.addedCandidates),
        removedCandidates: new Set(change.removedCandidates),
      }
      return
    }
    for (const candidate of change.addedCandidates) {
      pendingChange.addedCandidates.add(candidate)
      pendingChange.removedCandidates.delete(candidate)
    }
    for (const candidate of change.removedCandidates) {
      if (!pendingChange.addedCandidates.delete(candidate)) {
        pendingChange.removedCandidates.add(candidate)
      }
    }
    pendingChange.runtimeAffecting ||= change.runtimeAffecting
    pendingChange.file = change.file
  }

  const createChange = (file: string, change: CandidateDelta, changeOptions: { runtimeAffecting?: boolean } = {}): ViteSourceCandidateChange => ({
    ...change,
    file,
    runtimeAffecting: changeOptions.runtimeAffecting === true
      || options.isRuntimeAffectingSource?.(file) === true
      || isSourceStyleRequest(file),
  })

  const apply = (change: ViteSourceCandidateChange) => {
    if (isSourceStyleRequest(change.file)) {
      clear()
      return change
    }
    if (change.runtimeAffecting) {
      queueFullRegeneration()
      return change
    }
    const preserveDeletedCss = options.getGeneratorOptions().hmr.preserveDeletedCss
    if (preserveDeletedCss) {
      if (change.addedCandidates.size > 0) {
        queueChange(change)
      }
      else if (!pendingChange && !pendingFullRegeneration) {
        clear()
      }
      return change
    }
    clear()
    if (!preserveDeletedCss) {
      queueFullRegeneration()
    }
    return change
  }

  const resolve = (generatorCode: string, file: string) => {
    const fileKey = normalizeCssTargetFile(file)
    if (
      options.getCommand() !== 'serve'
      || !pendingChange
      || pendingChange.runtimeAffecting
      || pendingChange.addedCandidates.size === 0
      || (options.getGeneratorOptions().target === 'weapp' && hasUserCssLayerBlocks(generatorCode))
      || !options.cleanGeneratedCssByFile.has(fileKey)
      || !options.generatedClassSetByFile.has(fileKey)
      || (pendingTargetsArmed && !pendingCssTargetFiles?.has(fileKey))
    ) {
      return undefined
    }
    return pendingChange
  }

  const finishTarget = (file: string) => {
    if (!pendingChange && !pendingFullRegeneration) {
      return
    }
    if (!pendingTargetsArmed || !pendingCssTargetFiles) {
      return
    }
    pendingCssTargetFiles.delete(normalizeCssTargetFile(file))
    if (pendingCssTargetFiles.size === 0) {
      clear()
    }
  }

  const armTargets = (cssModules: ViteHmrModule[], fallbackCssIds: Iterable<string>) => {
    if (!pendingChange && !pendingFullRegeneration) {
      pendingCssTargetFiles = undefined
      pendingTargetsArmed = false
      return
    }
    const targets = new Set<string>()
    const addTarget = (file?: string | null) => {
      if (!file) {
        return
      }
      const key = normalizeCssTargetFile(file)
      if (pendingFullRegeneration || options.cleanGeneratedCssByFile.has(key)) {
        targets.add(key)
      }
    }
    for (const module of cssModules) {
      addTarget(module.id)
      addTarget(module.file)
      addTarget(module.url)
    }
    for (const id of fallbackCssIds) {
      addTarget(id)
    }
    pendingCssTargetFiles = targets
    pendingTargetsArmed = true
  }

  const reconcileRuntimeCandidates = (
    file: string,
    candidates: Iterable<string>,
    rootCssIds: Iterable<string>,
  ) => {
    if (options.getCommand() !== 'serve' || pendingFullRegeneration) {
      return
    }
    const generatedClassSets: Set<string>[] = []
    const seenFiles = new Set<string>()
    for (const id of rootCssIds) {
      const fileKey = normalizeCssTargetFile(id)
      if (seenFiles.has(fileKey)) {
        continue
      }
      seenFiles.add(fileKey)
      const classSet = options.generatedClassSetByFile.get(fileKey)
      if (classSet) {
        generatedClassSets.push(classSet)
      }
    }
    if (generatedClassSets.length === 0) {
      return
    }
    const addedCandidates = new Set<string>()
    for (const candidate of candidates) {
      if (generatedClassSets.some(classSet => !classSet.has(candidate))) {
        addedCandidates.add(candidate)
      }
    }
    if (addedCandidates.size === 0) {
      return
    }
    apply(createChange(file, {
      addedCandidates,
      removedCandidates: new Set(),
    }))
  }

  return {
    apply,
    armTargets,
    clear,
    createChange,
    finishTarget,
    hasPendingCandidateAppend: () => pendingChange != null && !pendingChange.runtimeAffecting && pendingChange.addedCandidates.size > 0,
    hasPendingChange: () => pendingChange != null || pendingFullRegeneration,
    queueFullRegeneration,
    reconcileRuntimeCandidates,
    resolve,
    shouldForceFullRegeneration: (file: string, resolved: boolean) => {
      if (options.getCommand() !== 'serve') {
        return false
      }
      if (pendingFullRegeneration) {
        return pendingTargetsArmed && pendingCssTargetFiles?.has(normalizeCssTargetFile(file)) === true
      }
      return pendingChange != null
        && !resolved
        && pendingTargetsArmed
        && pendingCssTargetFiles?.has(normalizeCssTargetFile(file)) === true
    },
    snapshotDebugState: () => ({
      pendingAddedCandidates: pendingChange?.addedCandidates.size ?? 0,
      pendingCssTargets: pendingCssTargetFiles?.size ?? 0,
      pendingFullRegeneration,
    }),
  }
}
