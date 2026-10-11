import type { OutputAsset, OutputBundle } from 'rollup'
import path from 'node:path'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { normalizeOutputPathKey } from '@/bundlers/shared/module-graph'
import { AssetEmissionPlan } from '@/compiler'
import { parseImportRequest } from '../../../generation/directives'
import { isPureLocalCssImportWrapper } from '../../../generation/local-imports'
import { isRootStyleOutputFile } from '../processed-css-assets/style-files'
import { applyViteAssetEmissionPlan } from './asset-emission-plan'

export function isRootMiniProgramStyleOutputFile(file: string) {
  const normalized = normalizeOutputPathKey(file.replace(/[?#].*$/, ''))
  return !normalized.includes('/')
    && /\.(?:wxss|acss|ttss|qss|jxss|tyss)$/i.test(normalized)
}

export function createRelativeCssImportRequest(targetFile: string, importedFile: string) {
  const normalizedTargetFile = normalizeOutputPathKey(targetFile.replace(/[?#].*$/, ''))
  const normalizedImportedFile = normalizeOutputPathKey(importedFile.replace(/[?#].*$/, ''))
  const targetDir = path.posix.dirname(normalizedTargetFile)
  const baseDir = targetDir === '.' ? '' : targetDir
  const relative = path.posix.relative(baseDir, normalizedImportedFile)
  return relative.startsWith('.') ? relative : `./${relative}`
}

export function createCssImportShell(targetFile: string, importedFile: string) {
  return `@import "${createRelativeCssImportRequest(targetFile, importedFile)}";\n`
}

export function resolveSingleCssImportOutputFile(targetFile: string, css: string) {
  let importedFile: string | undefined
  try {
    const root = postcss.parse(css)
    root.walkAtRules('import', (atRule) => {
      if (importedFile !== undefined) {
        return
      }
      const request = parseImportRequest(atRule.params)
      if (!request || /^(?:https?:)?\/\//i.test(request) || request.startsWith('data:')) {
        return
      }
      const cleanRequest = normalizeOutputPathKey(request.replace(/[?#].*$/, ''))
      if (!/\.(?:css|wxss|acss|ttss|qss|jxss|tyss)$/i.test(cleanRequest)) {
        return
      }
      const targetDir = path.posix.dirname(normalizeOutputPathKey(targetFile))
      importedFile = path.posix.normalize(cleanRequest.startsWith('/') ? cleanRequest.slice(1) : path.posix.join(targetDir, cleanRequest))
    })
  }
  catch {
  }
  return importedFile
}

export function createRootMiniProgramOriginStyleOutputFile(file: string) {
  const normalized = normalizeOutputPathKey(file.replace(/[?#].*$/, ''))
  if (/(?:^|\/)[^/]+-origin\.[^.]+$/i.test(normalized)) {
    return normalized
  }
  return normalized.replace(/(\.[^.]+)$/, '-origin$1')
}

export function shouldKeepRootMiniProgramStyleAsImportShell(enabled: boolean | undefined) {
  return enabled === true
}

export function shouldPreserveFrameworkRootMiniProgramImportShell(options: {
  css: string
  file: string
  isWebGeneratorTarget: boolean
  matchesCss: boolean
  shouldKeep: () => boolean | undefined
}) {
  return !options.isWebGeneratorTarget
    && options.matchesCss
    && isRootStyleOutputFile(options.file)
    && isPureLocalCssImportWrapper(options.css)
    && shouldKeepRootMiniProgramStyleAsImportShell(options.shouldKeep())
}

export interface ResolveFrameworkRootImportShellPlanOptions {
  assetSourceFile: string
  configuredTargetFiles: Iterable<string | undefined>
  file: string
  isMainChunk: boolean
  isWebGeneratorTarget: boolean
  matchesCss: boolean
  processedTargetFiles: Iterable<string | undefined>
  rawSource: string
  rememberedTarget: string | undefined
  rootImportShellOutputFile: string
  shouldKeep: () => boolean | undefined
  shouldMoveToOrigin: () => boolean | undefined
}

export interface FrameworkRootImportShellPlan {
  isCurrentImportShell: boolean
  reusableTarget: string | undefined
  targetToRemember: string | undefined
}

export function resolveFrameworkRootImportShellPlan(
  options: ResolveFrameworkRootImportShellPlanOptions,
): FrameworkRootImportShellPlan {
  const isCurrentImportShell = shouldPreserveFrameworkRootMiniProgramImportShell({
    css: options.rawSource,
    file: options.rootImportShellOutputFile,
    isWebGeneratorTarget: options.isWebGeneratorTarget,
    matchesCss: options.matchesCss,
    shouldKeep: options.shouldKeep,
  })
  if (isCurrentImportShell) {
    // 多个合法导入不能被收缩成单一重定向关系。
    const imports = postcss.parse(options.rawSource).nodes.filter(node => node.type === 'atrule' && node.name === 'import')
    const importedFile = imports.length === 1
      ? resolveSingleCssImportOutputFile(options.rootImportShellOutputFile, options.rawSource)
      : undefined
    return {
      isCurrentImportShell,
      reusableTarget: undefined,
      targetToRemember: importedFile && isRootStyleOutputFile(importedFile)
        && normalizeOutputPathKey(importedFile) !== normalizeOutputPathKey(options.rootImportShellOutputFile)
        ? importedFile
        : undefined,
    }
  }
  if (options.rememberedTarget) {
    return {
      isCurrentImportShell,
      reusableTarget: options.rememberedTarget,
      targetToRemember: undefined,
    }
  }
  const canInferTarget = !options.isWebGeneratorTarget
    && isRootMiniProgramStyleOutputFile(options.rootImportShellOutputFile)
    && normalizeOutputPathKey(options.assetSourceFile) === normalizeOutputPathKey(options.file)
    && options.isMainChunk
    && shouldKeepRootMiniProgramStyleAsImportShell(options.shouldKeep())
    && !shouldMoveRootMiniProgramStyleToImportShellOrigin(options.shouldMoveToOrigin())
  if (!canInferTarget) {
    return {
      isCurrentImportShell,
      reusableTarget: undefined,
      targetToRemember: undefined,
    }
  }
  const targets = new Set([
    ...options.configuredTargetFiles,
    ...options.processedTargetFiles,
  ].filter((file): file is string =>
    typeof file === 'string'
    && isRootMiniProgramStyleOutputFile(file)
    && normalizeOutputPathKey(file) !== normalizeOutputPathKey(options.rootImportShellOutputFile),
  ))
  const target = targets.size === 1 ? [...targets][0] : undefined
  return {
    isCurrentImportShell,
    reusableTarget: target,
    targetToRemember: target,
  }
}

export function restoreFrameworkRootMiniProgramImportShellAssets(
  bundle: OutputBundle,
  options: {
    debug?: ((format: string, ...args: unknown[]) => void) | undefined
    isWebGeneratorTarget: boolean
    matchesCss: (file: string) => boolean
    onUpdate?: ((file: string, oldVal: string, newVal: string) => void) | undefined
    recordCssAssetResult?: ((file: string, css: string) => void) | undefined
    shouldKeep: (file: string, css: string) => boolean | undefined
    targetByFile: ReadonlyMap<string, string>
  },
) {
  if (options.isWebGeneratorTarget || options.targetByFile.size === 0) {
    return 0
  }
  const plan = new AssetEmissionPlan()
  const writeTargets = new Map<string, OutputAsset>()
  let restored = 0
  for (const [sourceFile, targetFile] of options.targetByFile) {
    if (
      !options.matchesCss(sourceFile)
      || !options.matchesCss(targetFile)
      || !isRootStyleOutputFile(sourceFile)
      || !isRootStyleOutputFile(targetFile)
      || normalizeOutputPathKey(sourceFile) === normalizeOutputPathKey(targetFile)
    ) {
      continue
    }
    const output = Object.entries(bundle).find(([bundleFile, candidate]) =>
      candidate.type === 'asset'
      && normalizeOutputPathKey(candidate.fileName || bundleFile) === normalizeOutputPathKey(sourceFile),
    )?.[1]
    if (output?.type !== 'asset') {
      continue
    }
    const rawSource = output.source.toString()
    if (!shouldKeepRootMiniProgramStyleAsImportShell(options.shouldKeep(sourceFile, rawSource))) {
      continue
    }
    if (isPureLocalCssImportWrapper(rawSource)) {
      continue
    }
    const nextSource = createCssImportShell(sourceFile, targetFile)
    if (rawSource === nextSource) {
      continue
    }
    plan.write(sourceFile, nextSource)
    writeTargets.set(sourceFile, output)
    options.recordCssAssetResult?.(sourceFile, nextSource)
    options.onUpdate?.(sourceFile, rawSource, nextSource)
    options.debug?.('restore framework root css import shell: %s -> %s', sourceFile, targetFile)
    restored++
  }
  applyViteAssetEmissionPlan(plan, {
    bundle,
    writeTargets,
  })
  return restored
}

function resolveRuntimeRootStyleOutputFile(bundle: OutputBundle, matchesCss: (file: string) => boolean) {
  const rootChunks = Object.entries(bundle).flatMap(([bundleFile, output]) => {
    if (output.type !== 'chunk') {
      return []
    }
    const file = normalizeOutputPathKey(output.fileName || bundleFile)
    if (file.includes('/')) {
      return []
    }
    return [{ file, isEntry: output.isEntry === true }]
  })
  const entryChunks = rootChunks.filter(chunk => chunk.isEntry)
  const rootChunkStems = new Set((entryChunks.length > 0 ? entryChunks : rootChunks).map(chunk => path.posix.parse(chunk.file).name))
  const candidates = Object.entries(bundle).flatMap(([bundleFile, output]) => {
    if (output.type !== 'asset') {
      return []
    }
    const file = normalizeOutputPathKey(output.fileName || bundleFile)
    return isRootMiniProgramStyleOutputFile(file)
      && matchesCss(file)
      && rootChunkStems.has(path.posix.parse(file).name)
      ? [file]
      : []
  })
  return candidates.length === 1 ? candidates[0] : undefined
}

export function linkFrameworkRootStyleToRuntimeEntry(
  bundle: OutputBundle,
  options: {
    debug?: ((format: string, ...args: unknown[]) => void) | undefined
    matchesCss: (file: string) => boolean
    onUpdate?: ((file: string, oldVal: string, newVal: string) => void) | undefined
    recordCssAssetResult?: ((file: string, css: string) => void) | undefined
    targetByFile: ReadonlyMap<string, string>
  },
) {
  if (options.targetByFile.size === 0) {
    return 0
  }
  const runtimeRootFile = resolveRuntimeRootStyleOutputFile(bundle, options.matchesCss)
  if (!runtimeRootFile) {
    return 0
  }
  const frameworkRootFiles = [...options.targetByFile.keys()].filter(file =>
    normalizeOutputPathKey(file) !== normalizeOutputPathKey(runtimeRootFile)
    && isRootMiniProgramStyleOutputFile(file)
    && options.matchesCss(file),
  )
  if (frameworkRootFiles.length !== 1) {
    return 0
  }
  const frameworkRootFile = frameworkRootFiles[0]!
  const runtimeOutput = Object.entries(bundle).find(([bundleFile, output]) =>
    output.type === 'asset'
    && normalizeOutputPathKey(output.fileName || bundleFile) === normalizeOutputPathKey(runtimeRootFile),
  )?.[1]
  const frameworkOutput = Object.entries(bundle).find(([bundleFile, output]) =>
    output.type === 'asset'
    && normalizeOutputPathKey(output.fileName || bundleFile) === normalizeOutputPathKey(frameworkRootFile),
  )?.[1]
  if (runtimeOutput?.type !== 'asset' || frameworkOutput?.type !== 'asset') {
    return 0
  }
  const runtimeSource = runtimeOutput.source.toString()
  const importedRuntimeFile = resolveSingleCssImportOutputFile(runtimeRootFile, runtimeSource)
  if (importedRuntimeFile && normalizeOutputPathKey(importedRuntimeFile) === normalizeOutputPathKey(frameworkRootFile)) {
    return 0
  }
  const importedFrameworkFile = resolveSingleCssImportOutputFile(frameworkRootFile, frameworkOutput.source.toString())
  if (importedFrameworkFile && normalizeOutputPathKey(importedFrameworkFile) === normalizeOutputPathKey(runtimeRootFile)) {
    return 0
  }
  const nextSource = `${createCssImportShell(runtimeRootFile, frameworkRootFile)}${runtimeSource}`
  runtimeOutput.source = nextSource
  options.recordCssAssetResult?.(runtimeRootFile, nextSource)
  options.onUpdate?.(runtimeRootFile, runtimeSource, nextSource)
  options.debug?.('link framework root css to runtime entry: %s -> %s', runtimeRootFile, frameworkRootFile)
  return 1
}

export function shouldMoveRootMiniProgramStyleToImportShellOrigin(enabled: boolean | undefined) {
  return enabled === true
}
