import type {
  LengthUnitsRuntimeOptions,
  TailwindContentTokenReport,
  TailwindcssExtractOptions,
  TailwindcssExtractResult,
  TailwindCssRuntimeOptions,
} from './runtime-types'
import type { TailwindcssRuntimeLike } from '@/types'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { extractProjectCandidatesWithPositions, resolveValidTailwindV4Candidates } from '@weapp-tailwindcss/engine'
import { logger } from '@weapp-tailwindcss/logger'
import { collectRuntimeApplyCandidates } from '@weapp-tailwindcss/postcss/transform'
import { defuOverrideArray } from '@weapp-tailwindcss/shared'
import { findNearestPackageRoot } from '@/context/workspace'
import { omitUndefined } from '@/utils/object'
import { normalizeExtendLengthUnits, normalizeTailwindcssRuntimeOptions, resolveRuntimeBareArbitraryValues } from './runtime-options'
import {
  createDefaultResolvePaths,
  findTailwindConfig,
  resolveModuleFromPaths,
  resolveTailwindConfigFallback,
} from './runtime-resolve'
import { loadTailwindV4DesignSystem, resolveTailwindV4SourceFromRuntime } from './v4-engine'
import { resolveCssMacroTailwindV4Source } from './v4-engine/css-macro-source'
import { DEFAULT_TAILWINDCSS_GENERATOR_MAJOR_VERSION } from './version'

const require = createRequire(import.meta.url)

type TailwindUserOptions = NonNullable<TailwindCssRuntimeOptions['tailwindcss']>
type TailwindCacheOptions = Exclude<NonNullable<TailwindCssRuntimeOptions['cache']>, boolean>
type TailwindApplyOptions = NonNullable<TailwindCssRuntimeOptions['apply']>

export interface CreateTailwindcssRuntimeOptions {
  basedir?: string
  cacheDir?: string
  supportCustomLengthUnits?: boolean | LengthUnitsRuntimeOptions
  tailwindcss?: TailwindUserOptions
  tailwindcssRuntimeOptions?: TailwindCssRuntimeOptions
}

function createPackageInfo(tailwindOptions: TailwindUserOptions | undefined): TailwindcssRuntimeLike['packageInfo'] {
  const packageName = tailwindOptions?.packageName ?? 'tailwindcss'
  const resolvePaths = tailwindOptions?.resolve?.paths
  let rootPath: string | undefined
  const cwdPackageJsonPath = tailwindOptions?.cwd
    ? path.join(tailwindOptions.cwd, 'package.json')
    : undefined
  if (cwdPackageJsonPath) {
    try {
      const packageJson = require(cwdPackageJsonPath) as { name?: string }
      if (packageJson.name === packageName) {
        rootPath = cwdPackageJsonPath
      }
    }
    catch {
    }
  }
  rootPath ??= resolveModuleFromPaths(`${packageName}/package.json`, resolvePaths ?? [])
  if (!rootPath) {
    for (const resolvePath of [tailwindOptions?.cwd, ...(resolvePaths ?? [])]) {
      if (!resolvePath) {
        continue
      }
      try {
        rootPath = createRequire(path.join(resolvePath, 'package.json')).resolve(`${packageName}/package.json`)
        break
      }
      catch {
      }
    }
  }
  if (rootPath) {
    const packageJsonPath = rootPath
    const packageRoot = path.dirname(packageJsonPath)
    try {
      const packageJson = require(packageJsonPath) as { version?: string }
      return {
        name: packageName,
        version: packageJson.version,
        rootPath: packageRoot,
        packageJsonPath,
        packageJson,
      }
    }
    catch {
      return {
        name: packageName,
        version: undefined,
        rootPath: packageRoot,
        packageJsonPath,
        packageJson: {},
      }
    }
  }

  const packageInfo = {
    name: packageName,
    version: undefined,
    rootPath: '',
    packageJsonPath: '',
    packageJson: {},
  } as TailwindcssRuntimeLike['packageInfo']
  return packageInfo
}

function resolveMajorVersion(tailwindOptions: TailwindUserOptions | undefined, packageInfo: TailwindcssRuntimeLike['packageInfo']) {
  if (tailwindOptions?.version === 4) {
    return tailwindOptions.version
  }

  const version = packageInfo.version
  if (version?.startsWith('4.')) {
    return 4
  }
  return DEFAULT_TAILWINDCSS_GENERATOR_MAJOR_VERSION
}

function createFallbackTailwindcssRuntime(options?: TailwindCssRuntimeOptions): TailwindcssRuntimeLike {
  const packageInfo = createPackageInfo(options?.tailwindcss)

  return {
    packageInfo,
    majorVersion: resolveMajorVersion(options?.tailwindcss, packageInfo),
    options,
    async getClassSet() {
      return new Set<string>()
    },
    async extract(_options?: TailwindcssExtractOptions): Promise<TailwindcssExtractResult> {
      const classSet = new Set<string>()
      return {
        classList: [],
        classSet,
      } as Awaited<TailwindcssExtractResult>
    },
    async collectContentTokens() {
      return {
        entries: [],
        filesScanned: 0,
        sources: [],
        skippedFiles: [],
      }
    },
  }
}

function createEngineTailwindcssRuntime(options: TailwindCssRuntimeOptions): TailwindcssRuntimeLike {
  const tailwindOptions = options.tailwindcss
  const packageInfo = createPackageInfo(tailwindOptions)
  const majorVersion = resolveMajorVersion(tailwindOptions, packageInfo)
  let classSetCache: Set<string> | undefined
  let runtime: TailwindcssRuntimeLike

  function applyClassSetFilter(classSet: Set<string>) {
    if (typeof options.filter !== 'function') {
      return classSet
    }
    return new Set([...classSet].filter(className => options.filter?.(className) !== false))
  }

  async function collectClassSet() {
    const report = await collectContentTokens()
    const rawCandidates = new Set((report.entries as Array<{ rawCandidate?: string } | string>).map((entry) => {
      return typeof entry === 'string' ? entry : entry.rawCandidate
    }).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))
    const source = resolveCssMacroTailwindV4Source(await resolveTailwindV4SourceFromRuntime(runtime))
    const bareArbitraryValues = resolveRuntimeBareArbitraryValues(runtime.options)
    const designSystem = await loadTailwindV4DesignSystem(source)
    const candidates = new Set(resolveValidTailwindV4Candidates(designSystem, rawCandidates, {
      ...(bareArbitraryValues === undefined ? {} : { bareArbitraryValues }),
    }))
    await collectTailwindV4CssCandidates(candidates)
    return applyClassSetFilter(candidates)
  }

  async function collectTailwindV4CssCandidates(candidates: Set<string>) {
    const source = resolveCssMacroTailwindV4Source(await resolveTailwindV4SourceFromRuntime(runtime))
    const cssList = [
      source.css,
      ...(source.cssSources ?? []).map(cssSource => cssSource.css).filter((css): css is string => typeof css === 'string'),
    ]
    for (const css of cssList) {
      for (const candidate of collectRuntimeApplyCandidates(css)) {
        candidates.add(candidate)
      }
    }
  }

  async function collectContentTokens(): Promise<TailwindContentTokenReport> {
    const source = resolveCssMacroTailwindV4Source(await resolveTailwindV4SourceFromRuntime(runtime))
    const report = await extractProjectCandidatesWithPositions({
      base: source.base,
      baseFallbacks: source.baseFallbacks,
      css: source.css,
      cwd: source.projectRoot,
      ...(source.sources === undefined ? {} : { sources: source.sources }),
    })
    return {
      entries: report.entries,
      filesScanned: report.filesScanned,
      sources: source.sources ?? [],
      skippedFiles: report.skippedFiles,
    }
  }

  async function extract(options?: TailwindcssExtractOptions): Promise<TailwindcssExtractResult> {
    let classSet = await collectClassSet()
    const filter = options?.removeUniversalSelector === true
      ? (className: string) => className !== '*'
      : undefined
    if (filter) {
      classSet = new Set([...classSet].filter(filter))
    }
    if (typeof options?.write === 'boolean') {
      // `@weapp-tailwindcss/engine` 不写补丁产物；保留参数兼容。
    }
    classSetCache = classSet
    return {
      classList: [...classSet],
      classSet,
    }
  }

  runtime = {
    packageInfo,
    majorVersion,
    options,
    async getClassSet() {
      return (await extract({ write: false })).classSet
    },
    getClassSetSync() {
      return classSetCache ?? new Set<string>()
    },
    extract,
    collectContentTokens,
  }

  return runtime
}

let hasLoggedMissingTailwind = false

const TAILWINDCSS_NOT_FOUND_RE = /tailwindcss not found/i
const UNABLE_TO_LOCATE_TAILWINDCSS_RE = /unable to locate tailwind css package/i

export function createTailwindcssRuntime(options?: CreateTailwindcssRuntimeOptions): TailwindcssRuntimeLike {
  const { basedir, cacheDir, supportCustomLengthUnits, tailwindcss, tailwindcssRuntimeOptions } = options || {}
  const cache: TailwindCacheOptions = {
    enabled: true,
    driver: 'memory',
  }
  const normalizedBasedir = basedir ? path.resolve(basedir) : undefined
  // 8.7+ 自带 context fingerprint，默认可安全共享缓存文件。
  // 这里优先维持包级缓存目录，避免把缓存散落到 src 等子目录。
  const cacheRoot = findNearestPackageRoot(normalizedBasedir) ?? normalizedBasedir ?? process.cwd()

  if (cacheDir) {
    if (path.isAbsolute(cacheDir)) {
      cache.dir = cacheDir
    }
    else if (normalizedBasedir) {
      cache.dir = path.resolve(normalizedBasedir, cacheDir)
    }
    else {
      cache.dir = path.resolve(process.cwd(), cacheDir)
    }
  }
  else {
    cache.dir = path.join(cacheRoot, 'node_modules', '.cache', '@tailwindcss-mangle', 'engine')
  }

  if (normalizedBasedir) {
    cache.cwd = normalizedBasedir
  }

  const resolvePaths = createDefaultResolvePaths(cache.cwd ?? normalizedBasedir ?? process.cwd())

  const normalizedUserOptions = normalizeTailwindcssRuntimeOptions(tailwindcssRuntimeOptions)

  const extendLengthUnits = normalizeExtendLengthUnits(supportCustomLengthUnits ?? true)

  const baseTailwindOptions = defuOverrideArray<TailwindUserOptions, Partial<TailwindUserOptions>[]>(
    (tailwindcss ?? {}) as TailwindUserOptions,
    omitUndefined({
      cwd: normalizedBasedir,
      resolve: {
        paths: resolvePaths,
      },
    }) as Partial<TailwindUserOptions>,
  )

  const configuredPackageName = tailwindcss?.packageName ?? normalizedUserOptions?.tailwindcss?.packageName
  baseTailwindOptions.packageName = configuredPackageName
    ?? baseTailwindOptions.packageName
    ?? 'tailwindcss'

  if (!baseTailwindOptions.postcssPlugin) {
    baseTailwindOptions.postcssPlugin = 'tailwindcss'
  }

  if (typeof baseTailwindOptions.postcssPlugin === 'string') {
    const resolvedPlugin = resolveModuleFromPaths(baseTailwindOptions.postcssPlugin, resolvePaths)
    if (resolvedPlugin) {
      baseTailwindOptions.postcssPlugin = resolvedPlugin
    }
  }

  const baseOptions: TailwindCssRuntimeOptions = omitUndefined({
    projectRoot: normalizedBasedir,
    cache,
    tailwindcss: baseTailwindOptions,
    apply: omitUndefined({
      exposeContext: true,
      extendLengthUnits,
    }) satisfies TailwindApplyOptions,
  }) as TailwindCssRuntimeOptions

  const mergedOptions = defuOverrideArray<TailwindCssRuntimeOptions, TailwindCssRuntimeOptions[]>(
    (normalizedUserOptions ?? {}) as TailwindCssRuntimeOptions,
    baseOptions,
  )
  const resolvedOptions = mergedOptions
  const resolvedTailwindOptions: TailwindUserOptions | undefined = resolvedOptions.tailwindcss

  if (resolvedTailwindOptions) {
    const existingResolve = resolvedTailwindOptions.resolve ?? {}
    const customPaths = Array.isArray(existingResolve.paths) && existingResolve.paths.length > 0
    const sourcePaths = customPaths ? [...(existingResolve.paths ?? []), ...resolvePaths] : resolvePaths
    resolvedTailwindOptions.resolve = {
      ...existingResolve,
      paths: [...new Set(sourcePaths)],
    }
    logger.debug('Tailwind resolve config %O', {
      packageName: resolvedTailwindOptions.packageName,
      version: resolvedTailwindOptions.version,
      resolve: resolvedTailwindOptions.resolve,
      cwd: resolvedTailwindOptions.cwd,
    })

    if (typeof resolvedTailwindOptions.postcssPlugin === 'string') {
      const resolvedPlugin = resolveModuleFromPaths(
        resolvedTailwindOptions.postcssPlugin,
        resolvedTailwindOptions.resolve?.paths ?? resolvePaths,
      )
      if (resolvedPlugin) {
        resolvedTailwindOptions.postcssPlugin = resolvedPlugin
      }
    }

    const searchRoots = new Set<string>()
    if (resolvedTailwindOptions.cwd) {
      searchRoots.add(resolvedTailwindOptions.cwd)
    }
    for (const resolvePath of resolvedTailwindOptions.resolve?.paths ?? []) {
      const parentDir = path.dirname(resolvePath)
      searchRoots.add(parentDir)
    }
    const configPath = findTailwindConfig(searchRoots)
    if (!resolvedTailwindOptions.config) {
      if (configPath) {
        resolvedTailwindOptions.config = configPath
      }
      else {
        const fallbackConfig = resolveTailwindConfigFallback(
          resolvedTailwindOptions.packageName,
          resolvedTailwindOptions.resolve.paths ?? resolvePaths,
        )
        if (fallbackConfig) {
          resolvedTailwindOptions.config = fallbackConfig
        }
      }
    }
    if (!resolvedTailwindOptions.cwd && configPath) {
      resolvedTailwindOptions.cwd = path.dirname(configPath)
    }
    resolvedOptions.tailwindcss = resolvedTailwindOptions
  }

  try {
    return createEngineTailwindcssRuntime(resolvedOptions)
  }
  catch (error) {
    const searchPaths = resolvedOptions.tailwindcss?.resolve?.paths
    if (error instanceof Error && TAILWINDCSS_NOT_FOUND_RE.test(error.message)) {
      if (!hasLoggedMissingTailwind) {
        logger.warn('Tailwind CSS 未安装，已跳过 Tailwind 运行时能力。若需使用 Tailwind 能力，请安装 tailwindcss。')
        hasLoggedMissingTailwind = true
      }
      return createFallbackTailwindcssRuntime(resolvedOptions)
    }
    if (error instanceof Error && UNABLE_TO_LOCATE_TAILWINDCSS_RE.test(error.message)) {
      logger.error('无法定位 Tailwind CSS 包 "%s"，已尝试路径: %O', resolvedOptions.tailwindcss?.packageName, searchPaths)
    }
    throw error
  }
}
