import type { TailwindcssPatchOptions } from 'tailwindcss-patch'
import type { TailwindCssRuntimeOptions } from '../packages/weapp-tailwindcss/src/tailwindcss/runtime-types'
import type { MiniProgramThemeExpectation } from '../scripts/demo-visual-e2e-report/types'
import { createRequire } from 'node:module'
import nodePath from 'node:path'
import process from 'node:process'
import { format as formatMessage } from 'node:util'
import { getConfig } from '@tailwindcss-mangle/config'
import fg from 'fast-glob'
import fs from 'fs-extra'
import path from 'pathe'
import prettier from 'prettier'
import { TailwindcssPatcher } from 'tailwindcss-patch'
import { loadTailwindV4DesignSystem, resolveTailwindV4SourceFromRuntimeOptions, resolveValidTailwindV4Candidates } from '../packages/weapp-tailwindcss/src/tailwindcss/v4-engine'
import { removeWxmlId } from '../packages/weapp-tailwindcss/test/util'
import { collectProjectSourceCandidates } from './tokenSourceReports'

export { collectCssSnapshots } from './snapshotUtils'
export type { CssSnapshotEntry } from './snapshotUtils'

export {
  removeWxmlId,
}

export function logE2EDebug(message: string, ...args: unknown[]) {
  if (process.env.E2E_DEBUG_PATCH !== '1') {
    return
  }
  process.stdout.write(`${formatMessage(message, ...args)}\n`)
}

export function logE2EError(message: string, ...args: unknown[]) {
  process.stderr.write(`${formatMessage(message, ...args)}\n`)
}

interface LegacyTailwindLocatorOptions {
  cwd?: string
  config?: string
}

interface LegacyTailwindV4Source {
  base?: string
}

interface LegacyTailwindV4Options {
  cssEntries?: string[]
  css?: string
  base?: string
  sources?: LegacyTailwindV4Source[]
}

interface LegacyTailwindOptions {
  version?: number
  packageName?: string
  config?: string
  cwd?: string
  postcssPlugin?: string
  resolve?: {
    paths?: string[]
  }
  v2?: LegacyTailwindLocatorOptions
  v3?: LegacyTailwindLocatorOptions
  v4?: LegacyTailwindV4Options
}

interface LegacyCacheOptions {
  cwd?: string
  dir?: string
  file?: string
  driver?: 'file' | 'memory' | 'noop'
  strategy?: 'merge' | 'overwrite'
  enabled?: boolean
}

interface E2EPatchOptions extends TailwindcssPatchOptions {
  packageName?: string
  cwd?: string
  basedir?: string
  tailwindcss?: LegacyTailwindOptions
  tailwind?: LegacyTailwindOptions
  cache?: LegacyCacheOptions | boolean
  resolve?: {
    paths?: string[]
  }
  output?: {
    filename?: string
    loose?: boolean
    removeUniversalSelector?: boolean
  }
  patch?: E2EPatchOptions
}

type NormalizedPatchOptions = E2EPatchOptions

export interface ProjectEntry {
  theme?: MiniProgramThemeExpectation
  name: string
  projectPath: string
  cssFile: string
  cssFiles?: string[]
  buildEnv?: Record<string, string>
  requiresHBuilderX?: boolean
  url?: string
  skipOpenAutomator?: boolean
  forbidEmptyBlockAtRules?: boolean
  extraSnapshots?: Array<'issue-909-transform'>
}

export interface ProjectCssSnapshotFile {
  cssFile: string
  snapshotName: string
}

const CSS_SNAPSHOT_OUTPUT_PREFIXES = [
  'unpackage/dist/dev/mp-weixin/',
  'dist/build/mp-weixin/',
  'dist/dev/mp-weixin/',
  'dist/wx/',
  'dist/',
]

export function getProjectCssFiles(entry: ProjectEntry): string[] {
  const files = entry.cssFiles?.length ? entry.cssFiles : [entry.cssFile]
  return Array.from(new Set(files))
}

export function getProjectCssSnapshotFiles(entry: ProjectEntry): ProjectCssSnapshotFile[] {
  return getProjectCssFiles(entry).map((cssFile) => {
    if (cssFile === entry.cssFile) {
      return {
        cssFile,
        snapshotName: path.basename(cssFile),
      }
    }

    const normalized = cssFile.replace(/\\/g, '/')
    const stripped = CSS_SNAPSHOT_OUTPUT_PREFIXES.reduce((current, prefix) => {
      return current.startsWith(prefix) ? current.slice(prefix.length) : current
    }, normalized)

    return {
      cssFile,
      snapshotName: stripped || path.basename(cssFile),
    }
  })
}

export function wait(ts = 1000) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(undefined)
    }, ts)
  })
}

export function projectFilter(x: ProjectEntry[]) {
  const filter = process.env['E2E_PROJECT_FILTER']
  if (!filter) {
    return x
  }
  const pattern = new RegExp(filter)
  return x.filter(entry => pattern.test(entry.name))
}

export function formatWxml(wxml: string) {
  return prettier.format(wxml, {
    parser: 'html',
    tabWidth: 2,
    useTabs: false,
    semi: false,
    singleQuote: true,
    endOfLine: 'lf',
    trailingComma: 'none',
    printWidth: 180,
    bracketSameLine: true,
    htmlWhitespaceSensitivity: 'ignore',
  })
}

interface ExtractionResult {
  classList?: string[]
  output?: {
    filename?: string
    loose?: boolean
  }
}

interface TailwindInfo {
  major: number
  pluginPath?: string
}

const extractionTasks = new Map<string, Promise<ExtractionResult | undefined>>()
const patchTasks = new Map<string, Promise<void>>()
const TAILWIND_CSS_DIRECTIVE_RE = /(?:@import\s+["']tailwindcss(?:\/[^"']*)?["']|@tailwind\s+(?:base|components|utilities))(?=\s|;|$)/

export function clearTailwindPatchTaskCache(root: string) {
  const normalizedRoot = path.resolve(root)
  patchTasks.delete(normalizedRoot)
  extractionTasks.delete(normalizedRoot)
}

function normalizePath(root: string, target: string) {
  return path.isAbsolute(target) ? target : path.resolve(root, target)
}

function getWorkspaceRoot(root: string) {
  return path.resolve(root, '..', '..')
}

export async function discoverTailwindV4CssEntries(root: string) {
  const files = await fg('**/*.{css,pcss,postcss,scss,sass,less,styl,stylus}', {
    absolute: true,
    cwd: root,
    ignore: [
      '**/.cache/**',
      '**/.turbo/**',
      '**/.vite/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/unpackage/**',
    ],
    onlyFiles: true,
  })
  const entries: string[] = []
  for (const file of files.sort()) {
    // glob 使用逻辑分隔符返回结果；进入文件读取及 CSS 入口配置前还原原生路径。
    const sourcePath = nodePath.normalize(file)
    const source = await fs.readFile(sourcePath, 'utf8')
    if (TAILWIND_CSS_DIRECTIVE_RE.test(source)) {
      entries.push(sourcePath)
    }
  }
  return entries
}

function resolveTailwindInfo(root: string, options: NormalizedPatchOptions): TailwindInfo | null {
  const packageName = typeof options.packageName === 'string' && options.packageName.length > 0 ? options.packageName : 'tailwindcss'
  const requireFromRoot = createRequire(path.join(root, 'package.json'))
  try {
    const pkgJson = requireFromRoot(`${packageName}/package.json`) as { version?: string }
    const version = pkgJson?.version
    if (!version) {
      return null
    }
    const major = Number.parseInt(version.split('.')[0] ?? '', 10)
    if (Number.isNaN(major)) {
      return null
    }
    const pluginName = major >= 4 ? '@tailwindcss/postcss' : packageName
    let pluginPath: string | undefined
    try {
      pluginPath = requireFromRoot.resolve(pluginName)
    }
    catch {
      pluginPath = undefined
    }
    return {
      major,
      pluginPath,
    }
  }
  catch {
    return null
  }
}

function normalizePatchOptions(root: string, patchOptions: unknown): NormalizedPatchOptions {
  const legacyRoot = (patchOptions as E2EPatchOptions | undefined)?.patch
  const resolved: NormalizedPatchOptions = {
    ...((legacyRoot as NormalizedPatchOptions | undefined) ?? {}),
    ...((patchOptions as NormalizedPatchOptions | undefined) ?? {}),
  }

  resolved.projectRoot = resolved.projectRoot ?? resolved.cwd ?? resolved.basedir ?? root
  delete (resolved as any).cwd
  delete (resolved as any).basedir

  const resolvePaths = new Set(
    [
      ...(resolved.resolve?.paths ?? []),
      ...(resolved.tailwindcss?.resolve?.paths ?? []),
      ...(resolved.tailwind?.resolve?.paths ?? []),
      root,
      path.resolve(root, 'node_modules'),
      getWorkspaceRoot(root),
      path.resolve(getWorkspaceRoot(root), 'node_modules'),
    ].map(entry => normalizePath(root, entry)),
  )

  const mergedResolve = {
    ...(resolved.tailwindcss?.resolve ?? {}),
    ...(resolved.tailwind?.resolve ?? {}),
    ...(resolved.resolve ?? {}),
    paths: [...resolvePaths],
  }
  delete (resolved as any).resolve

  if (resolved.output) {
    resolved.extract = {
      ...(resolved.extract ?? {}),
      ...(resolved.output.filename ? { file: resolved.output.filename } : {}),
      ...(resolved.output.loose !== undefined ? { pretty: resolved.output.loose ? 2 : false } : {}),
      ...(resolved.output.removeUniversalSelector !== undefined
        ? { removeUniversalSelector: resolved.output.removeUniversalSelector }
        : {}),
    }
    delete (resolved as any).output
  }

  if (resolved.extract?.file) {
    resolved.extract = {
      ...resolved.extract,
      file: normalizePath(root, resolved.extract.file),
    }
  }

  if (resolved.cache && typeof resolved.cache === 'object') {
    resolved.cache = {
      ...resolved.cache,
      dir: resolved.cache.dir ? normalizePath(root, resolved.cache.dir) : resolved.cache.dir,
      cwd: resolved.cache.cwd ? normalizePath(root, resolved.cache.cwd) : resolved.cache.cwd,
      file: resolved.cache.file ? normalizePath(root, resolved.cache.file) : resolved.cache.file,
    }
  }

  let tw = resolved.tailwindcss ? { ...resolved.tailwindcss } : undefined
  if (!tw && resolved.tailwind) {
    tw = { ...resolved.tailwind }
  }

  if (tw) {
    tw.resolve = mergedResolve

    if (typeof tw.config === 'string') {
      tw.config = normalizePath(root, tw.config)
    }

    if (tw.v4) {
      const v4 = { ...tw.v4 }
      if (Array.isArray(v4.cssEntries)) {
        v4.cssEntries = v4.cssEntries.map(entry => normalizePath(root, entry))
      }
      if (typeof v4.css === 'string') {
        v4.css = normalizePath(root, v4.css)
      }
      if (typeof v4.base === 'string') {
        v4.base = normalizePath(root, v4.base)
      }
      if (Array.isArray(v4.sources)) {
        v4.sources = v4.sources.map((source) => {
          if (source && typeof source.base === 'string') {
            return {
              ...source,
              base: normalizePath(root, source.base),
            }
          }
          return source
        })
      }
      tw.v4 = v4
    }
  }

  const tailwindInfo = resolveTailwindInfo(root, resolved)
  if (tailwindInfo) {
    tw = tw ? { ...tw } : {}
    if (tw.version === undefined) {
      tw.version = tailwindInfo.major
    }
    if (tw.postcssPlugin === undefined) {
      tw.postcssPlugin = tailwindInfo.pluginPath ?? (tailwindInfo.major >= 4 ? '@tailwindcss/postcss' : 'tailwindcss')
    }
    resolved.tailwindcss = tw
  }
  else if (tw) {
    resolved.tailwindcss = tw
  }
  else if (resolvePaths.size > 0) {
    resolved.tailwindcss = {
      resolve: mergedResolve,
    }
  }
  delete (resolved as Record<string, unknown>).tailwind

  resolved.apply = {
    ...(resolved.apply ?? {}),
    extendLengthUnits: resolved.apply?.extendLengthUnits ?? {
      units: ['rpx'],
      overwrite: true,
    },
  }

  return resolved
}

async function readClassListFromFile(filename: string | undefined) {
  if (!filename) {
    return undefined
  }
  try {
    const content = await fs.readFile(filename, 'utf8')
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed : undefined
  }
  catch (error: any) {
    if (error?.code && (error.code === 'ENOENT' || error.code === 'EPERM')) {
      return undefined
    }
    throw error
  }
}

async function extractTailwindV4ClassList(
  root: string,
  patchOptions: NormalizedPatchOptions,
) {
  const runtimeOptions = patchOptions as unknown as TailwindCssRuntimeOptions
  const tailwindcss = runtimeOptions.tailwindcss
  const v4 = tailwindcss?.v4
  const { cssEntries = [], cssSources = [], ...sharedV4Options } = v4 ?? {}
  const sourceRoots = [
    ...cssEntries.map(cssEntry => ({
      ...sharedV4Options,
      cssEntries: [cssEntry],
    })),
    ...cssSources.map(cssSource => ({
      ...sharedV4Options,
      cssSources: [cssSource],
    })),
  ]
  if (sourceRoots.length === 0) {
    sourceRoots.push(v4 ?? {})
  }

  const rawCandidates = await collectProjectSourceCandidates(root)
  const classSet = new Set<string>()
  for (const sourceOptions of sourceRoots) {
    const source = await resolveTailwindV4SourceFromRuntimeOptions({
      projectRoot: runtimeOptions.projectRoot ?? root,
      tailwindcss: {
        ...tailwindcss,
        version: 4,
        v4: sourceOptions,
      },
    })
    const designSystem = await loadTailwindV4DesignSystem(source)
    const validated = resolveValidTailwindV4Candidates(designSystem, rawCandidates, {
      ...(v4?.bareArbitraryValues === undefined ? {} : { bareArbitraryValues: v4.bareArbitraryValues }),
    })
    for (const candidate of validated) {
      if (patchOptions.filter?.(candidate) !== false) {
        classSet.add(candidate)
      }
    }
  }

  if (patchOptions.extract?.removeUniversalSelector) {
    classSet.delete('*')
  }
  return [...classSet].sort()
}

interface ResolvedPatchRuntime {
  effectiveOutput: {
    filename?: string
    loose?: boolean
  }
  packageJsonPath: string
  packageName?: string | undefined
  patchOptions: NormalizedPatchOptions
}

async function resolvePatchRuntime(root: string): Promise<ResolvedPatchRuntime | undefined> {
  const { config } = await getConfig(root)
  if (!config) {
    return undefined
  }

  const legacyConfig = config as { patch?: unknown, registry?: unknown }
  const rawPatchOptions = legacyConfig.registry ?? legacyConfig.patch ?? config
  const patchOptions = normalizePatchOptions(root, rawPatchOptions)
  const tailwindOptions = patchOptions.tailwindcss
  if (tailwindOptions?.version === 4) {
    const v4 = tailwindOptions.v4 ?? {}
    const hasExplicitCssSource = Boolean(v4.css || v4.cssEntries?.length)
    if (!hasExplicitCssSource) {
      patchOptions.tailwindcss = {
        ...tailwindOptions,
        v4: {
          ...v4,
          cssEntries: await discoverTailwindV4CssEntries(root),
        },
      }
    }
  }
  const outputOptions = patchOptions.extract
    ? {
        filename: patchOptions.extract.file,
        loose: patchOptions.extract.pretty !== false,
      }
    : undefined

  const fallbackOutputFilename = path.resolve(root, '.tw-patch/tw-class-list.json')
  const effectiveOutput = outputOptions ?? { filename: fallbackOutputFilename }

  const packageJsonPath = path.resolve(root, 'package.json')
  let packageName: string | undefined
  try {
    const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as { name?: string } | undefined
    packageName = typeof pkg?.name === 'string' && pkg.name.length > 0 ? pkg.name : undefined
  }
  catch {
    packageName = undefined
  }

  return {
    effectiveOutput,
    packageJsonPath,
    packageName,
    patchOptions,
  }
}

async function runWithProjectPackageEnv<T>(
  root: string,
  runtime: Pick<ResolvedPatchRuntime, 'packageJsonPath' | 'packageName'>,
  callback: () => Promise<T>,
): Promise<T> {
  const previousEnv = {
    npm_package_json: process.env.npm_package_json,
    PNPM_PACKAGE_NAME: process.env.PNPM_PACKAGE_NAME,
    INIT_CWD: process.env.INIT_CWD,
  }

  if (await fs.exists(runtime.packageJsonPath)) {
    process.env.npm_package_json = runtime.packageJsonPath
  }
  else {
    delete process.env.npm_package_json
  }
  if (runtime.packageName) {
    process.env.PNPM_PACKAGE_NAME = runtime.packageName
  }
  else {
    delete process.env.PNPM_PACKAGE_NAME
  }
  process.env.INIT_CWD = root

  const originalCwd = process.cwd()
  try {
    if (originalCwd !== root) {
      process.chdir(root)
    }
    return await callback()
  }
  finally {
    if (previousEnv.npm_package_json !== undefined) {
      process.env.npm_package_json = previousEnv.npm_package_json
    }
    else {
      delete process.env.npm_package_json
    }
    if (previousEnv.PNPM_PACKAGE_NAME !== undefined) {
      process.env.PNPM_PACKAGE_NAME = previousEnv.PNPM_PACKAGE_NAME
    }
    else {
      delete process.env.PNPM_PACKAGE_NAME
    }
    if (previousEnv.INIT_CWD !== undefined) {
      process.env.INIT_CWD = previousEnv.INIT_CWD
    }
    else {
      delete process.env.INIT_CWD
    }
    if (process.cwd() !== originalCwd) {
      process.chdir(originalCwd)
    }
  }
}

async function runTwPatch(root: string): Promise<void> {
  const runtime = await resolvePatchRuntime(root)
  if (!runtime) {
    return
  }

  const twPatcher = new TailwindcssPatcher(runtime.patchOptions)
  if (twPatcher.majorVersion >= 4) {
    return
  }

  logE2EDebug('[e2e] Tailwind patch options for %s: %o', root, runtime.patchOptions.tailwindcss)
  await runWithProjectPackageEnv(root, runtime, async () => {
    await twPatcher.patch()
    const status = await twPatcher.getPatchStatus()
    const lengthUnitStatus = status.entries.find(entry => entry.name === 'extendLengthUnits')
    if (lengthUnitStatus?.status !== 'applied') {
      throw new Error(`[e2e] Tailwind v4 rpx length-unit patch was not applied for ${root}: ${JSON.stringify(status, null, 2)}`)
    }
  })
}

async function runTwExtract(root: string): Promise<ExtractionResult | undefined> {
  const runtime = await resolvePatchRuntime(root)
  if (!runtime) {
    return undefined
  }

  const isTailwindV4 = runtime.patchOptions.tailwindcss?.version === 4
  if (!isTailwindV4 && process.env.E2E_FORCE_EXTRACT !== 'true') {
    const cachedClassList = await readClassListFromFile(runtime.effectiveOutput?.filename)
    if (cachedClassList) {
      return {
        classList: cachedClassList,
        output: runtime.effectiveOutput,
      }
    }
  }

  await twPatch(root)

  const twPatcher = new TailwindcssPatcher(runtime.patchOptions)
  logE2EDebug('[e2e] Tailwind patch options for %s: %o', root, runtime.patchOptions.tailwindcss)

  return runWithProjectPackageEnv(root, runtime, async () => {
    if (twPatcher.majorVersion >= 4) {
      const classList = await extractTailwindV4ClassList(root, runtime.patchOptions)
      logE2EDebug('[e2e] Engine class list for %s (%d): %o', root, classList.length, classList)
      return {
        classList,
        output: runtime.effectiveOutput,
      }
    }

    const result = await twPatcher.extract({ write: false })
    return {
      classList: result?.classList,
      output: runtime.effectiveOutput,
    }
  })
}

export function twPatch(root: string) {
  const normalizedRoot = path.resolve(root)
  let task = patchTasks.get(normalizedRoot)
  if (!task) {
    task = runTwPatch(normalizedRoot)
    patchTasks.set(normalizedRoot, task)
  }
  return task
}

export function twExtract(root: string) {
  const normalizedRoot = path.resolve(root)
  let task = extractionTasks.get(normalizedRoot)
  if (!task) {
    task = runTwExtract(normalizedRoot)
    extractionTasks.set(normalizedRoot, task)
  }
  return task
}

const LEADING_SEPARATORS_RE = /^[\\/]+/

export async function resolveSnapshotFile(testDir: string, suite: string, projectName: string, fileName: string) {
  const snapshotDir = path.resolve(testDir, '__snapshots__', suite, projectName)
  await fs.mkdir(snapshotDir, { recursive: true })
  const sanitizedName = fileName.replace(LEADING_SEPARATORS_RE, '')
  const snapshotPath = path.resolve(snapshotDir, sanitizedName)
  const relative = path.relative(snapshotDir, snapshotPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Invalid snapshot file name: ${fileName}`)
  }
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true })
  return snapshotPath
}
