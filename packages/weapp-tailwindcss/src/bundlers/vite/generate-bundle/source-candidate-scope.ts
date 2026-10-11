import type { BundleSnapshot } from '../bundle-state'
import type { SourceCandidateFilterOptions } from '../source-candidates'
import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import path from 'node:path'
import { isRootStyleOutputFile } from '../processed-css-assets/style-files'
import { collectMiniProgramSubpackageSourceEntries, isSubpackageOutputFile } from './subpackages'

interface CreateSubpackageSourceCandidateScopeOptions {
  cssSourceFiles?: Iterable<string> | undefined
  getSourceCandidatesForEntries?: ((entries: TailwindSourceEntry[] | undefined, options?: SourceCandidateFilterOptions) => Set<string>) | undefined
  getSourceCandidateSourcesForEntries?: ((entries: TailwindSourceEntry[] | undefined, options?: SourceCandidateFilterOptions) => Map<string, Set<string>>) | undefined
  projectRoot?: string | undefined
  rootDir: string
  snapshot: BundleSnapshot
  sourceRoot?: string | undefined
  subpackageRoots?: Set<string> | undefined
  tailwindcssBasedir?: string | undefined
  useIncrementalMode: boolean
}

function intersectCandidateSets(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) {
    return new Set<string>()
  }
  const [small, large] = left.size <= right.size ? [left, right] : [right, left]
  const matched = new Set<string>()
  for (const candidate of small) {
    if (large.has(candidate)) {
      matched.add(candidate)
    }
  }
  return matched
}

function intersectCandidateSourceMaps(left: Map<string, Set<string>>, right: Map<string, Set<string>>) {
  if (left.size === 0 || right.size === 0) {
    return new Map<string, Set<string>>()
  }
  const matched = new Map<string, Set<string>>()
  for (const [candidate, sources] of left) {
    if (right.has(candidate)) {
      matched.set(candidate, sources)
    }
  }
  return matched
}

function normalizeSourceFile(file: string) {
  return path.resolve(file.replace(/[?#].*$/, ''))
}

function resolveSubpackageSourceRootFromFile(file: string, subpackageRoot: string) {
  const normalizedFile = normalizeSourceFile(file).split(path.sep).join('/')
  const normalizedRoot = subpackageRoot.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!normalizedRoot) {
    return undefined
  }
  const rootSegment = `/${normalizedRoot}/`
  const rootIndex = normalizedFile.lastIndexOf(rootSegment)
  if (rootIndex < 0) {
    return undefined
  }
  return normalizedFile.slice(0, rootIndex)
}

function collectSubpackageSourceRootsFromCssSources(
  cssSourceFiles: Iterable<string> | undefined,
  subpackageRoots: Set<string> | undefined,
) {
  const sourceRootsByPackageRoot = new Map<string, Set<string>>()
  if (!cssSourceFiles || !subpackageRoots) {
    return sourceRootsByPackageRoot
  }
  for (const file of cssSourceFiles) {
    if (typeof file !== 'string' || file.length === 0) {
      continue
    }
    for (const root of subpackageRoots) {
      const sourceRoot = resolveSubpackageSourceRootFromFile(file, root)
      if (!sourceRoot) {
        continue
      }
      const roots = sourceRootsByPackageRoot.get(root) ?? new Set<string>()
      roots.add(sourceRoot)
      sourceRootsByPackageRoot.set(root, roots)
    }
  }
  return sourceRootsByPackageRoot
}

function flattenSourceRoots(sourceRootsByPackageRoot: Map<string, Set<string>>) {
  return [...new Set([...sourceRootsByPackageRoot.values()].flatMap(roots => [...roots]))]
}

export function createSubpackageSourceCandidateScope(options: CreateSubpackageSourceCandidateScopeOptions) {
  const cssSourceRootsByPackageRoot = collectSubpackageSourceRootsFromCssSources(options.cssSourceFiles, options.subpackageRoots)
  const subpackageSourceExcludeEntries = options.subpackageRoots
    ? collectMiniProgramSubpackageSourceEntries(options.snapshot, options.subpackageRoots, [
        options.rootDir,
        options.tailwindcssBasedir,
        options.projectRoot,
        ...flattenSourceRoots(cssSourceRootsByPackageRoot),
      ])
    : []

  const isMainPackageStyleOutputFile = (file: string) =>
    options.subpackageRoots != null && !isSubpackageOutputFile(file, options.subpackageRoots)

  const resolveSubpackageOutputSourceEntries = (outputFile: string): TailwindSourceEntry[] | undefined => {
    if (!options.subpackageRoots) {
      return undefined
    }
    const matchedRoots = [...options.subpackageRoots].filter(root => isSubpackageOutputFile(outputFile, new Set([root])))
    if (matchedRoots.length !== 1) {
      return undefined
    }
    const root = matchedRoots[0]
    if (!root) {
      return undefined
    }
    const configuredSourceRoots = cssSourceRootsByPackageRoot.get(root)
    if (configuredSourceRoots?.size === 1) {
      return [{
        base: [...configuredSourceRoots][0]!,
        negated: false,
        pattern: `${root}/**/*`,
      }]
    }
    return options.sourceRoot
      ? [{
          base: options.sourceRoot,
          negated: false,
          pattern: `${root}/**/*`,
        }]
      : [{
          base: options.rootDir,
          negated: false,
          pattern: `**/${root}/**/*`,
        }]
  }

  const shouldExcludeSubpackageSourceCandidates = (outputFile: string, cssHandlerOptions: { isMainChunk?: boolean | undefined }) =>
    cssHandlerOptions.isMainChunk === true
    && subpackageSourceExcludeEntries.length > 0
    && isMainPackageStyleOutputFile(outputFile)

  const resolveScopedOutputFile = (outputFile: string, sourceFile?: string) => {
    if (!options.subpackageRoots || isSubpackageOutputFile(outputFile, options.subpackageRoots)) {
      return outputFile
    }
    return sourceFile && isSubpackageOutputFile(sourceFile, options.subpackageRoots)
      ? sourceFile
      : outputFile
  }

  const createScopedSourceCandidateGetter = (
    outputFile: string,
    cssHandlerOptions: { isMainChunk?: boolean | undefined },
    sourceFile?: string,
  ) => {
    if (!options.getSourceCandidatesForEntries) {
      return undefined
    }
    const scopedOutputFile = resolveScopedOutputFile(outputFile, sourceFile)
    const subpackageEntries = resolveSubpackageOutputSourceEntries(scopedOutputFile)
    if (subpackageEntries) {
      return (entries: TailwindSourceEntry[] | undefined, filterOptions?: SourceCandidateFilterOptions) => {
        if (entries !== undefined) {
          const scopedCandidates = options.getSourceCandidatesForEntries?.(entries, filterOptions) ?? new Set<string>()
          if (entries.length === 0) {
            return scopedCandidates
          }
          const subpackageCandidates = options.getSourceCandidatesForEntries?.(subpackageEntries, filterOptions) ?? new Set<string>()
          const matchedCandidates = intersectCandidateSets(scopedCandidates, subpackageCandidates)
          if (matchedCandidates.size > 0 || subpackageCandidates.size > 0) {
            return matchedCandidates
          }
          if (scopedCandidates.size > 0) {
            return scopedCandidates
          }
        }
        return options.getSourceCandidatesForEntries?.(subpackageEntries, filterOptions) ?? new Set<string>()
      }
    }
    if (!shouldExcludeSubpackageSourceCandidates(outputFile, cssHandlerOptions)) {
      return options.getSourceCandidatesForEntries
    }
    return (entries: TailwindSourceEntry[] | undefined, filterOptions?: SourceCandidateFilterOptions) =>
      options.getSourceCandidatesForEntries?.(entries, {
        ...filterOptions,
        excludeEntries: [
          ...(filterOptions?.excludeEntries ?? []),
          ...subpackageSourceExcludeEntries,
        ],
      }) ?? new Set<string>()
  }

  const createScopedSourceCandidateSourceGetter = (
    outputFile: string,
    cssHandlerOptions: { isMainChunk?: boolean | undefined },
    sourceFile?: string,
  ) => {
    if (!options.getSourceCandidateSourcesForEntries) {
      return undefined
    }
    const scopedOutputFile = resolveScopedOutputFile(outputFile, sourceFile)
    const subpackageEntries = resolveSubpackageOutputSourceEntries(scopedOutputFile)
    if (subpackageEntries) {
      return (entries: TailwindSourceEntry[] | undefined, filterOptions?: SourceCandidateFilterOptions) => {
        if (entries !== undefined) {
          const scopedSources = options.getSourceCandidateSourcesForEntries?.(entries, filterOptions) ?? new Map<string, Set<string>>()
          if (entries.length === 0) {
            return scopedSources
          }
          const subpackageSources = options.getSourceCandidateSourcesForEntries?.(subpackageEntries, filterOptions) ?? new Map<string, Set<string>>()
          const matchedSources = intersectCandidateSourceMaps(scopedSources, subpackageSources)
          if (matchedSources.size > 0 || subpackageSources.size > 0) {
            return matchedSources
          }
          if (scopedSources.size > 0) {
            return scopedSources
          }
        }
        return options.getSourceCandidateSourcesForEntries?.(subpackageEntries, filterOptions) ?? new Map<string, Set<string>>()
      }
    }
    if (!shouldExcludeSubpackageSourceCandidates(outputFile, cssHandlerOptions)) {
      return options.getSourceCandidateSourcesForEntries
    }
    return (entries: TailwindSourceEntry[] | undefined, filterOptions?: SourceCandidateFilterOptions) =>
      options.getSourceCandidateSourcesForEntries?.(entries, {
        ...filterOptions,
        excludeEntries: [
          ...(filterOptions?.excludeEntries ?? []),
          ...subpackageSourceExcludeEntries,
        ],
      }) ?? new Map<string, Set<string>>()
  }

  const shouldInjectCssIntoMainFromOutput = (
    outputFile: string,
    sourceFile: string,
    outputCssHandlerOptions: { isMainChunk?: boolean | undefined },
  ) =>
    // 主包页面仍拥有自己的样式及相对导入，增量模式不能把整份局部产物提升到根样式。
    isRootStyleOutputFile(outputFile)
    && (
      outputCssHandlerOptions.isMainChunk === true
      || (
        options.useIncrementalMode
        && isMainPackageStyleOutputFile(outputFile)
        && isMainPackageStyleOutputFile(sourceFile)
      )
    )

  return {
    createScopedSourceCandidateGetter,
    createScopedSourceCandidateSourceGetter,
    shouldExcludeSubpackageSourceCandidates,
    shouldInjectCssIntoMainFromOutput,
  }
}
