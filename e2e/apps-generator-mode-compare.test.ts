import type { AppsGeneratorCompareReportItem, CompareReportItem, CssSummary } from './apps-generator-report'
import type { DemoCoverageEntry } from './demoCoverageMatrix'
import type { ProjectEntry } from './shared'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import process from 'node:process'
import { execa } from 'execa'
import fg from 'fast-glob'
import path from 'pathe'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { createChineseMarkdownReport, createMarkdownReport } from './apps-generator-report'
import { mergeScopedGeneratorReport } from './apps-generator-report-scoped'
import { DEMO_COVERAGE_MATRIX } from './demoCoverageMatrix'
import { E2E_PROJECTS } from './projectEntries'
import { clearProjectBuildState } from './projectTest'
import { collectCssSnapshots, resolveSnapshotFile, twPatch } from './shared'
import { normalizeCssTextSnapshot, normalizeSnapshotName } from './snapshotUtils'

interface CompareProject {
  name: string
  fixturesDir: '../demo'
  rootDir: string
  platform: string
  allowedPlatforms: string[]
  cssFile: string
  cssPath: string
  requiredCssFiles: string[]
  buildScript: string
  buildEnv?: Record<string, string> | undefined
  cssSnapshotMode: 'entry' | 'directory'
  cssPattern: string
}

interface CreateProjectReportOptions {
  onPassed?: (result: {
    generatorResult: GeneratorBuildResult
  }) => void | Promise<void>
}

interface GeneratorBuildResult {
  css: string
  cssFiles: string[]
  cssSnapshots: GeneratorCssSnapshot[]
}

interface GeneratorCssSnapshot {
  fileName: string
  content: string
}

interface StableCssSnapshotOptions {
  structureIdentity?: boolean
}

const SUBPACKAGE_MARKER_PATTERNS = [
  /normal[-_]subpackage/i,
  /independent[-_]subpackage/i,
]
const SUBPACKAGE_ROOTS = ['sub-normal', 'sub-independent'] as const
const localHBuilderXProjectNames = new Set(
  DEMO_COVERAGE_MATRIX
    .filter(item => item.hbuilderxLocal)
    .map(item => item.name),
)
const cleanedSnapshotDirs = new Set<string>()

const MINI_PROGRAM_CSS_PATTERN = '**/*.{wx,ac,jx,tt,q,c,ty}ss'
const WEB_CSS_PATTERN = '**/*.css'
const RAW_TAILWIND_ENTRY_DIRECTIVE_RE = /@(import\s+["']tailwindcss|tailwind|theme|source)\b/
const USER_IMPORTED_UI_CSS_MARKERS = [
  '.weapp-tw-user-ui-card',
  '.weapp-tw-user-ui-loading',
  '@keyframes weappTwUserUiRotation',
  '@keyframes weappTwUserUiBreathe',
] as const
const APP_STYLE_COMPARE_PROJECT_NAMES = new Set([
  'uni-app-vite-tailwindcss-v4',
])

function filterCompareProjects(projects: CompareProject[]) {
  const filter = process.env['E2E_PROJECT_FILTER']
  if (!filter) {
    return projects
  }

  const pattern = new RegExp(filter)
  return projects.filter(project => pattern.test(project.name))
}

function isUpdatingSnapshots() {
  return expect.getState().snapshotState?.snapshotUpdateState === 'all'
}

async function clearSnapshotDirOnUpdate(...segments: string[]) {
  if (!isUpdatingSnapshots()) {
    return
  }

  const snapshotDir = path.resolve(__dirname, '__snapshots__', ...segments)
  if (cleanedSnapshotDirs.has(snapshotDir)) {
    return
  }

  cleanedSnapshotDirs.add(snapshotDir)
  await fs.rm(snapshotDir, { force: true, recursive: true })
}

const miniProgramProjects = E2E_PROJECTS
  .filter(entry => !localHBuilderXProjectNames.has(entry.name))
  .map(entry => createCompareProject(entry, '../demo'))

const projects: CompareProject[] = filterCompareProjects([
  ...miniProgramProjects,
  ...miniProgramProjects.flatMap(createH5CompareProjects),
  ...miniProgramProjects.flatMap(createAppCompareProjects),
])
const projectFilterEnabled = Boolean(process.env['E2E_PROJECT_FILTER'])

const UNSUPPORTED_LEGACY_SELECTOR_SET = new Set([
  ':after',
  ':before',
  '::after',
  '::before',
  ':-moz-focusring',
  ':-moz-ui-invalid',
  '::-webkit-calendar-picker-indicator',
  '::-webkit-date-and-time-value',
  '::-webkit-datetime-edit',
  '::-webkit-datetime-edit-day-field',
  '::-webkit-datetime-edit-fields-wrapper',
  '::-webkit-datetime-edit-hour-field',
  '::-webkit-datetime-edit-meridiem-field',
  '::-webkit-datetime-edit-millisecond-field',
  '::-webkit-datetime-edit-minute-field',
  '::-webkit-datetime-edit-month-field',
  '::-webkit-datetime-edit-second-field',
  '::-webkit-datetime-edit-year-field',
  '::-webkit-inner-spin-button',
  '::-webkit-input-placeholder',
  '::-webkit-outer-spin-button',
  '::-webkit-search-decoration',
  '::placeholder',
  '[hidden]:where(:not([hidden=\'until-found\']))',
  'a',
  'abbr:where([title])',
  'audio',
  'b',
  'button',
  'canvas',
  'code',
  'embed',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'html',
  'iframe',
  'img',
  'input',
  'input:where([type=\'button\'], [type=\'reset\'], [type=\'submit\'])',
  'kbd',
  'menu',
  'object',
  'ol',
  'optgroup',
  'pre',
  'progress',
  'samp',
  'select',
  'select[multiple] optgroup',
  'select[multiple] optgroup option',
  'select[size] optgroup',
  'select[size] optgroup option',
  'small',
  'strong',
  'sub',
  'summary',
  'sup',
  'svg',
  'table',
  'textarea',
  'ul',
  'video',
  'text',
  'view',
])

function compareText(a: string, b: string) {
  if (a < b) {
    return -1
  }
  if (a > b) {
    return 1
  }
  return 0
}

function normalizeSelector(selector: string) {
  return selector
    .replaceAll('::before', ':before')
    .replaceAll('::after', ':after')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectSelectors(css: string) {
  const selectors = new Set<string>()

  postcss.parse(css).walkRules((rule) => {
    for (const item of rule.selectors) {
      const selector = normalizeSelector(item)
      if (selector && !UNSUPPORTED_LEGACY_SELECTOR_SET.has(selector)) {
        selectors.add(selector)
      }
    }
  })

  return [...selectors].sort()
}

function isThemeSelector(selector: string) {
  return /(?:^|[\s.])(?:theme-dark|system-dark|dark)_c/.test(selector) || /(?:^|[\s.])theme-dark(?:[\s.:#]|$)/.test(selector)
}

function summarizeCss(css: string): CssSummary {
  const selectors = collectSelectors(css)
  const themeSelectors = selectors.filter(isThemeSelector)
  const selectorText = selectors.join('\n')
  const themeSelectorText = themeSelectors.join('\n')
  return {
    bytes: Buffer.byteLength(css),
    selectors,
    hasSupports: css.includes('@supports'),
    hasHoverPseudo: /:hover\b/.test(css),
    hasTailwindBanner: /tailwindcss v\d+\./.test(css),
    hasSystemDarkModeMedia: css.includes('@media (prefers-color-scheme: dark)'),
    hasManualDarkModeSelector: /\.theme-dark(?:\s|\.)/.test(selectorText) || /\.(?:theme-dark|dark)_c\S+\.theme-dark/.test(selectorText),
    hasUnsupportedThemeAttributeSelector: themeSelectors.some(selector => /\[[^\]]+\]/.test(selector)),
    hasUnsupportedThemeComplexSelector: /:(?:where|not)\(/.test(themeSelectorText),
    hasWeappEscapedArbitrarySelector: /_b[^{}]*_B/.test(css),
    hasRawArbitrarySelector: /\\\[|\\\]/.test(css),
  }
}

function createCompareProject(entry: ProjectEntry, fixturesDir: '../demo'): CompareProject {
  const coverageEntry = findCoverageEntry(entry.name)
  const outputCssPath = path.join(entry.projectPath, entry.cssFile)
  const rootPrefix = `${entry.name}${path.sep}`
  const cssPath = outputCssPath.startsWith(rootPrefix)
    ? outputCssPath.slice(rootPrefix.length)
    : entry.cssFile
  const requiredCssFiles = (entry.cssFiles ?? [entry.cssFile]).map((file) => {
    const outputFilePath = path.join(entry.projectPath, file)
    return outputFilePath.startsWith(rootPrefix)
      ? outputFilePath.slice(rootPrefix.length)
      : file
  })

  return {
    name: entry.name,
    fixturesDir,
    rootDir: entry.name,
    platform: resolveDefaultBuildPlatform(entry, coverageEntry),
    allowedPlatforms: coverageEntry.platforms.map(platform => platform.platform),
    cssFile: outputCssPath,
    cssPath,
    requiredCssFiles,
    buildScript: 'build',
    cssSnapshotMode: 'entry',
    cssPattern: MINI_PROGRAM_CSS_PATTERN,
  }
}

function createH5CompareProjects(project: CompareProject): CompareProject[] {
  if (!project.allowedPlatforms.includes('h5')) {
    return []
  }
  const cssPath = resolveH5OutputCssPath(project)
  if (!cssPath) {
    return []
  }
  return [
    createH5CompareProject(project, {
      platform: 'web',
      buildEnv: {
        WEAPP_TW_WEB_COMPAT: '0',
      },
    }),
    createH5CompareProject(project, {
      platform: 'web-compact',
      buildEnv: {
        WEAPP_TW_WEB_COMPAT: '1',
      },
    }),
  ].map(item => ({
    ...item,
    cssPath,
    cssFile: path.join(item.rootDir, cssPath),
  }))
}

function createH5CompareProject(project: CompareProject, options: {
  platform: string
  buildEnv: Record<string, string>
}): CompareProject {
  return {
    ...project,
    platform: options.platform,
    buildScript: 'build:h5',
    buildEnv: options.buildEnv,
    cssSnapshotMode: 'directory',
    cssPattern: WEB_CSS_PATTERN,
    requiredCssFiles: [],
  }
}

function createAppCompareProjects(project: CompareProject): CompareProject[] {
  if (!APP_STYLE_COMPARE_PROJECT_NAMES.has(project.name)) {
    return []
  }
  return ['app-android', 'app-ios']
    .filter(platform => project.allowedPlatforms.includes(platform))
    .map(platform => createAppCompareProject(project, platform))
}

function createAppCompareProject(project: CompareProject, platform: string): CompareProject {
  const cssPath = 'dist/build/app'
  return {
    ...project,
    platform,
    buildScript: 'build:app',
    buildEnv: {
      UNI_UTS_PLATFORM: platform,
    },
    cssPath,
    cssFile: path.join(project.rootDir, cssPath),
    cssSnapshotMode: 'directory',
    cssPattern: WEB_CSS_PATTERN,
    requiredCssFiles: [],
  }
}

function resolveH5OutputCssPath(project: CompareProject) {
  if (project.name.startsWith('taro-')) {
    return 'dist'
  }
  if (project.name.startsWith('uni-app-')) {
    return 'dist/build/h5'
  }
}

function findCoverageEntry(name: string): DemoCoverageEntry {
  const entry = DEMO_COVERAGE_MATRIX.find(item => item.name === name)
  if (!entry) {
    throw new Error(`Missing demo coverage matrix entry for ${name}`)
  }
  return entry
}

function resolveDefaultBuildPlatform(project: ProjectEntry, entry: DemoCoverageEntry) {
  const outputPath = normalizeOutputCssFileName(path.join(project.projectPath, project.cssFile))
  const pathPlatform = resolveOutputPathPlatform(outputPath)
  if (pathPlatform) {
    return pathPlatform
  }

  const defaultPlatform = entry.platforms.find(platform => platform.buildScript === 'build')
  if (defaultPlatform) {
    return defaultPlatform.platform
  }

  const staticAutomatedPlatform = entry.platforms.find(platform => platform.staticCoverage === 'automated')
  if (staticAutomatedPlatform) {
    return staticAutomatedPlatform.platform
  }

  return entry.platforms[0]?.platform ?? 'unknown'
}

function resolveOutputPathPlatform(outputPath: string) {
  const segments = outputPath.split('/')
  for (const segment of segments) {
    if (/^(?:mp|quickapp|app)-/.test(segment) || segment === 'h5' || segment === 'h5:ssr' || segment === 'wx') {
      return segment
    }
  }
}

async function cleanProject(root: string) {
  await Promise.all([
    fs.rm(path.resolve(root, 'dist'), { recursive: true, force: true }),
    fs.rm(path.resolve(root, 'unpackage'), { recursive: true, force: true }),
    fs.rm(path.resolve(root, 'node_modules/.vite'), { recursive: true, force: true }),
    fs.rm(path.resolve(root, 'node_modules/.cache/tailwindcss-patch'), { recursive: true, force: true }),
    fs.rm(path.resolve(root, 'node_modules/.cache/weapp-tailwindcss'), { recursive: true, force: true }),
    fs.rm(path.resolve(root, 'src/node_modules/.cache/tailwindcss-patch'), { recursive: true, force: true }),
    fs.rm(path.resolve(root, 'src/node_modules/.cache/weapp-tailwindcss'), { recursive: true, force: true }),
    fs.rm(path.resolve(root, '.tw-patch/tailwindcss-target.json'), { force: true }),
    fs.rm(path.resolve(root, '.tw-patch/tw-class-list.json'), { force: true }),
  ])
  await clearProjectBuildState(root)
}

async function buildProject(project: CompareProject) {
  const projectBase = path.resolve(__dirname, project.fixturesDir)
  const root = path.resolve(projectBase, project.rootDir)
  const projectRoot = path.resolve(projectBase, project.rootDir)
  await cleanProject(root)
  await twPatch(root)

  await execa('pnpm', ['run', project.buildScript], {
    cwd: root,
    stdio: process.env.E2E_DEBUG_BUILD === '1' ? 'inherit' : 'pipe',
    env: {
      ...process.env,
      ...project.buildEnv,
      NODE_ENV: 'production',
      BROWSERSLIST_ENV: 'production',
      TARO_BUILD_STRICT: '1',
      UNI_BUILD_STRICT: '1',
      RUST_BACKTRACE: process.env.RUST_BACKTRACE ?? '1',
      npm_package_json: path.resolve(root, 'package.json'),
      INIT_CWD: root,
    },
  })

  const classList = await readBuildClassList(root)
  const snapshots = await collectOutputCssSnapshots(projectRoot, project, classList)
  return {
    css: snapshots.map(snapshot => snapshot.content).join('\n'),
    cssFiles: snapshots.map(snapshot => snapshot.fileName),
    cssSnapshots: snapshots,
  }
}

async function readBuildClassList(root: string) {
  try {
    const source = await fs.readFile(path.resolve(root, '.tw-patch/tw-class-list.json'), 'utf8')
    const parsed = JSON.parse(source)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : undefined
  }
  catch (error: any) {
    if (error?.code === 'ENOENT' || error?.code === 'EPERM') {
      return undefined
    }
    throw error
  }
}

async function collectOutputCssSnapshots(projectRoot: string, project: CompareProject, classList?: string[]) {
  const cssPath = project.cssPath
  if (project.cssSnapshotMode === 'directory') {
    return collectOutputDirectoryCssSnapshots(projectRoot, project, classList)
  }
  const entrySnapshots = await collectCssSnapshots(projectRoot, cssPath, {
    classList,
    normalizeTailwindV4RootVariableNoise: shouldNormalizeTailwindV4RootVariableNoise(projectRoot),
  })
  const outputRoot = path.dirname(path.resolve(projectRoot, cssPath))
  const entryRelativePath = normalizeOutputCssFileName(path.relative(outputRoot, path.resolve(projectRoot, cssPath)))
  const allCssFiles = await fg(MINI_PROGRAM_CSS_PATTERN, {
    absolute: false,
    cwd: outputRoot,
    onlyFiles: true,
  })
  const normalizedEntrySnapshots = entrySnapshots.map((snapshot, index): GeneratorCssSnapshot => ({
    ...snapshot,
    fileName: index === 0 ? entryRelativePath : normalizeOutputCssFileName(snapshot.fileName),
  }))
  const entryFileNames = new Set(normalizedEntrySnapshots.map(snapshot => normalizeCssSnapshotFileKey(snapshot.fileName)))
  const extraSnapshots = await Promise.all(
    allCssFiles
      .sort(compareCssOutputFile)
      .filter(file => !entryFileNames.has(normalizeCssSnapshotFileKey(file)))
      .map(async (file) => {
        const snapshots = await collectCssSnapshots(outputRoot, file, {
          classList,
          rootSnapshotName: normalizeOutputCssFileName(file),
          normalizeTailwindV4RootVariableNoise: shouldNormalizeTailwindV4RootVariableNoise(projectRoot),
        })
        return snapshots.map((snapshot, index): GeneratorCssSnapshot => ({
          ...snapshot,
          fileName: index === 0
            ? normalizeOutputCssFileName(file)
            : normalizeOutputCssFileName(snapshot.fileName),
        }))
      }),
  )

  return [
    ...normalizedEntrySnapshots,
    ...extraSnapshots.flat().sort(compareCssSnapshotEntry),
  ].filter(snapshot => snapshot.content.trim().length > 0)
}

async function collectOutputDirectoryCssSnapshots(projectRoot: string, project: CompareProject, classList?: string[]) {
  const outputRoot = path.resolve(projectRoot, project.cssPath)
  const allCssFiles = await fg(project.cssPattern, {
    absolute: false,
    cwd: outputRoot,
    onlyFiles: true,
  })
  const snapshots = await Promise.all(
    allCssFiles
      .sort(compareCssOutputFile)
      .map(async (file) => {
        const entries = await collectCssSnapshots(outputRoot, file, {
          classList,
          generatedCssSourceRoot: projectRoot,
          rootSnapshotName: normalizeOutputCssFileName(file),
          normalizeTailwindV4RootVariableNoise: shouldNormalizeTailwindV4RootVariableNoise(projectRoot),
        })
        return entries.map((snapshot, index): GeneratorCssSnapshot => ({
          ...snapshot,
          fileName: index === 0
            ? normalizeOutputCssFileName(file)
            : normalizeOutputCssFileName(snapshot.fileName),
        }))
      }),
  )
  return snapshots.flat().sort(compareCssSnapshotEntry).filter(snapshot => snapshot.content.trim().length > 0)
}

function shouldNormalizeTailwindV4RootVariableNoise(projectRoot: string) {
  return projectRoot.endsWith(`${path.sep}taro-vite-react-tailwindcss-v4`)
    || projectRoot.endsWith(`${path.sep}taro-vite-vue3-tailwindcss-v4`)
}

function normalizeOutputCssFileName(fileName: string) {
  return fileName.replace(/\\/g, '/')
}

function normalizeCssSnapshotFileKey(fileName: string) {
  return path.normalize(normalizeCssOutputSnapshotName(fileName))
}

function normalizeCssOutputSnapshotName(fileName: string) {
  const normalized = normalizeOutputCssFileName(fileName)
    .replace(/[.-][\w-]{8,}(?=\.css$)/g, '')
    .replace(/(^|\/)\d+(?=\.css$)/g, '$1chunk')
  return normalizeSnapshotName(normalized) ?? normalized
}

function compareCssOutputFile(a: string, b: string) {
  return compareText(normalizeCssOutputSnapshotName(a), normalizeCssOutputSnapshotName(b))
    || compareText(a, b)
}

function compareCssSnapshotEntry(
  a: { fileName: string, content: string },
  b: { fileName: string, content: string },
) {
  return compareText(normalizeCssOutputSnapshotName(a.fileName), normalizeCssOutputSnapshotName(b.fileName))
    || compareText(a.content, b.content)
    || compareText(a.fileName, b.fileName)
}

function withDuplicateCssFileSuffix(fileName: string, index: number) {
  const extension = path.extname(fileName)
  if (!extension) {
    return `${fileName}.${index}`
  }
  return `${fileName.slice(0, -extension.length)}.${index}${extension}`
}

function createCssSnapshotStructureIdentity(css: string) {
  try {
    const root = postcss.parse(css)
    const selectors = new Set<string>()
    const atRules = new Set<string>()
    const declarationProps = new Set<string>()

    root.walkRules((rule) => {
      for (const selector of rule.selectors) {
        selectors.add(normalizeSelector(selector))
      }
    })
    root.walkAtRules((rule) => {
      atRules.add(`${rule.name}:${rule.params.replace(/\s+/g, ' ').trim()}`)
    })
    root.walkDecls((decl) => {
      declarationProps.add(decl.prop.trim())
    })

    return JSON.stringify([
      [...selectors].sort(compareText),
      [...atRules].sort(compareText),
      [...declarationProps].sort(compareText),
    ])
  }
  catch {
    return css
  }
}

function createStableCssSnapshots(
  generatorResult: Pick<GeneratorBuildResult, 'css' | 'cssFiles'> & Partial<Pick<GeneratorBuildResult, 'cssSnapshots'>>,
  fallbackFileName: string,
  options: StableCssSnapshotOptions = {},
) {
  const cssSnapshots = generatorResult.cssSnapshots && generatorResult.cssSnapshots.length > 0
    ? generatorResult.cssSnapshots
    : [{ fileName: generatorResult.cssFiles[0] ?? fallbackFileName, content: generatorResult.css }]
  const entries = cssSnapshots.map((snapshot, index) => ({
    index,
    snapshot,
    fileName: normalizeCssOutputSnapshotName(snapshot.fileName),
  }))
  const groups = new Map<string, typeof entries>()
  for (const entry of entries) {
    const group = groups.get(entry.fileName)
    if (group) {
      group.push(entry)
    }
    else {
      groups.set(entry.fileName, [entry])
    }
  }
  const stableFileNames = new Map<number, string>()

  for (const [fileName, group] of groups) {
    if (group.length === 1) {
      stableFileNames.set(group[0].index, fileName)
      continue
    }

    const sortedGroup = group
      .map(entry => ({
        ...entry,
        structureIdentity: options.structureIdentity
          ? createCssSnapshotStructureIdentity(entry.snapshot.content)
          : undefined,
      }))
      .sort((a, b) => (
        compareText(a.structureIdentity ?? a.snapshot.content, b.structureIdentity ?? b.snapshot.content)
        || compareText(a.snapshot.content, b.snapshot.content)
        || compareText(a.snapshot.fileName, b.snapshot.fileName)
      ))
    sortedGroup.forEach((entry, index) => {
      stableFileNames.set(entry.index, withDuplicateCssFileSuffix(fileName, index + 1))
    })
  }

  const snapshots = entries
    .map(({ index, snapshot }) => ({
      ...snapshot,
      fileName: stableFileNames.get(index) ?? snapshot.fileName,
    }))
  return options.structureIdentity
    ? snapshots.sort((a, b) => compareText(a.fileName, b.fileName))
    : snapshots
}

function createReportItem(
  project: CompareProject,
  generatorResult: GeneratorBuildResult,
): CompareReportItem {
  const generator = summarizeCss(`${createNormalizedGeneratorCss(project, generatorResult)}\n`)
  const cssSnapshots = createStableCssSnapshots(generatorResult, project.cssFile, {
    structureIdentity: isWebStyleDirectoryProject(project),
  })

  return {
    name: project.name,
    fixture: 'demo',
    platform: project.platform,
    allowedPlatforms: project.allowedPlatforms,
    cssFile: project.cssFile,
    cssFiles: cssSnapshots.length > 0 ? cssSnapshots.map(snapshot => snapshot.fileName) : [project.cssFile],
    status: 'passed',
    generator,
  }
}

function isH5WebProject(project: CompareProject) {
  return project.cssSnapshotMode === 'directory' && (project.platform === 'web' || project.platform === 'web-compact')
}

function isAppStyleProject(project: CompareProject) {
  return project.cssSnapshotMode === 'directory' && (project.platform === 'app-android' || project.platform === 'app-ios')
}

function isWebStyleDirectoryProject(project: CompareProject) {
  return isH5WebProject(project) || isAppStyleProject(project)
}

function isMiniProgramProject(project: CompareProject) {
  return !isWebStyleDirectoryProject(project)
}

function expectWeappViteTailwindV4CssIsolation(project: CompareProject, generatorResult: GeneratorBuildResult) {
  if (project.name !== 'weapp-vite-tailwindcss-v4') {
    return
  }
  expect(generatorResult.cssFiles, 'weapp-vite v4 should not emit source-root-prefixed css files').not.toContain('miniprogram/app.wxss')
  expect(generatorResult.cssFiles, 'weapp-vite v4 should not emit source-root-prefixed subpackage css files').not.toContain('miniprogram/sub-normal/pages/index.wxss')
  const independent = generatorResult.cssSnapshots.find(snapshot => snapshot.fileName === 'sub-independent/pages/index.wxss')
  expect(independent, 'weapp-vite v4 independent subpackage css snapshot should exist').toBeTruthy()
  expect(independent?.content, 'independent subpackage css should keep its own candidates').toMatch(/independent[-_]subpackage/i)
  expect(independent?.content, 'independent subpackage css should not include normal subpackage candidates').not.toMatch(/normal[-_]subpackage/i)
  expect(independent?.content, 'independent subpackage css should not include main package candidates').not.toContain('text-red-500')
}

function expectSubpackageMarkersInGeneratedCss(project: CompareProject, generatorResult: GeneratorBuildResult) {
  if (!project.cssFile.includes('sub-normal') && !generatorResult.cssFiles.some(file => file.includes('sub-normal'))) {
    return
  }
  const snapshots = generatorResult.cssSnapshots.length > 0
    ? generatorResult.cssSnapshots
    : [{ fileName: project.cssFile, content: generatorResult.css }]
  const subpackageSnapshots = snapshots.filter(snapshot =>
    SUBPACKAGE_ROOTS.some(root => normalizeOutputCssFileName(snapshot.fileName).includes(root)),
  )

  if (subpackageSnapshots.length === 0) {
    return
  }

  for (const pattern of SUBPACKAGE_MARKER_PATTERNS) {
    expect(
      subpackageSnapshots.some(snapshot => pattern.test(snapshot.content)),
      `${project.name} generated subpackage css outputs should include ${pattern} marker`,
    ).toBe(true)
  }
}

function expectPackageCssIsolation(project: CompareProject, generatorResult: GeneratorBuildResult) {
  if (!generatorResult.cssFiles.some(file => SUBPACKAGE_ROOTS.some(root => normalizeOutputCssFileName(file).includes(root)))) {
    return
  }

  const snapshots = generatorResult.cssSnapshots.length > 0
    ? generatorResult.cssSnapshots
    : [{ fileName: project.cssFile, content: generatorResult.css }]

  for (const snapshot of snapshots) {
    const fileName = normalizeOutputCssFileName(snapshot.fileName)
    const isNormalSubpackage = fileName.includes('sub-normal')
    const isIndependentSubpackage = fileName.includes('sub-independent')
    const isSubpackage = isNormalSubpackage || isIndependentSubpackage

    if (!isSubpackage) {
      for (const pattern of SUBPACKAGE_MARKER_PATTERNS) {
        expect(
          snapshot.content,
          `${project.name} main package css ${snapshot.fileName} should not include subpackage marker ${pattern}`,
        ).not.toMatch(pattern)
      }
    }
    if (isNormalSubpackage) {
      expect(
        snapshot.content,
        `${project.name} normal subpackage css ${snapshot.fileName} should not include independent subpackage candidates`,
      ).not.toMatch(/independent[-_]subpackage/i)
    }
    if (isIndependentSubpackage) {
      expect(
        snapshot.content,
        `${project.name} independent subpackage css ${snapshot.fileName} should not include normal subpackage candidates`,
      ).not.toMatch(/normal[-_]subpackage/i)
    }
  }
}

function expectWeappViteAppCssInlined(project: CompareProject, generatorResult: GeneratorBuildResult) {
  if (project.name !== 'weapp-vite-tailwindcss-v4') {
    return
  }
  const appCss = generatorResult.cssSnapshots.find(snapshot => normalizeOutputCssFileName(snapshot.fileName) === 'app.wxss')
  expect(appCss, 'weapp-vite app.wxss snapshot should exist').toBeTruthy()
  expect(appCss?.content, 'weapp-vite app.wxss should inline app.css imports').not.toContain('@import')
  expect(appCss?.content, 'weapp-vite app.wxss should keep main Tailwind utilities').toContain('.text-red-700')
  expect(appCss?.content, 'weapp-vite app.wxss should keep user imported css').toContain('.weapp-tw-user-ui-card')
  expect(appCss?.content.match(/\.text-red-700\b/g) ?? [], 'weapp-vite app.wxss should not duplicate main Tailwind utilities').toHaveLength(1)
  expect(appCss?.content.match(/\.weapp-tw-user-ui-card\b/g) ?? [], 'weapp-vite app.wxss should not duplicate imported user css').toHaveLength(1)
  expect(appCss?.content, 'weapp-vite app.wxss should not include normal subpackage candidates').not.toMatch(/normal[-_]subpackage/i)
  expect(appCss?.content, 'weapp-vite app.wxss should not include independent subpackage candidates').not.toMatch(/independent[-_]subpackage/i)
}

function expectUserImportedUiCssMarkers(project: CompareProject, generatorResult: GeneratorBuildResult) {
  for (const marker of USER_IMPORTED_UI_CSS_MARKERS) {
    expect(
      generatorResult.css,
      `${project.name} should keep user imported UI css marker ${marker}`,
    ).toContain(marker)
  }
}

function expectSubpackageCssFiles(project: CompareProject, generatorResult: GeneratorBuildResult) {
  const requiredSubpackageCssFiles = project.requiredCssFiles
    .map(file => file.replace(/\\/g, '/'))
    .filter(file => SUBPACKAGE_ROOTS.some(root => file.includes(root)))
    .map((file) => {
      const outputRoot = normalizeOutputCssFileName(path.dirname(project.cssPath))
      if (outputRoot && outputRoot !== '.' && file.startsWith(`${outputRoot}/`)) {
        return file.slice(outputRoot.length + 1)
      }
      return file
    })
    .map(normalizeOutputCssFileName)

  if (requiredSubpackageCssFiles.length === 0) {
    return
  }

  for (const requiredCssFile of requiredSubpackageCssFiles) {
    expect(
      generatorResult.cssFiles,
      `${project.name} should emit required subpackage css output ${requiredCssFile}`,
    ).toContain(requiredCssFile)
  }
}

function expectNoMiniProgramSpecificityPlaceholders(project: CompareProject, generatorResult: GeneratorBuildResult) {
  if (!isMiniProgramProject(project)) {
    return
  }
  const snapshots = generatorResult.cssSnapshots.length > 0
    ? generatorResult.cssSnapshots
    : [{ fileName: project.cssFile, content: generatorResult.css }]
  for (const snapshot of snapshots) {
    expect(
      snapshot.content,
      `${project.name} ${snapshot.fileName} should not include cascade layer specificity placeholders`,
    ).not.toMatch(/:not\(#(?:\\#|n)\)/)
  }
  expect(
    generatorResult.css,
    `${project.name} generated css should not include cascade layer specificity placeholders`,
  ).not.toMatch(/:not\(#(?:\\#|n)\)/)
}

function expectWebStyleDirectoryCss(project: CompareProject, generatorResult: GeneratorBuildResult) {
  if (!isWebStyleDirectoryProject(project)) {
    return
  }
  expect(generatorResult.cssFiles.length, `${project.name} ${project.platform} should emit css files`).toBeGreaterThan(0)
  expect(generatorResult.css, `${project.name} ${project.platform} should not leave raw Tailwind entry directives`).not.toMatch(RAW_TAILWIND_ENTRY_DIRECTIVE_RE)
  expect(generatorResult.cssFiles.every(file => file.endsWith('.css')), `${project.name} ${project.platform} should only collect css outputs`).toBe(true)
}

function normalizeError(error: unknown) {
  if (error && typeof error === 'object') {
    const maybeError = error as {
      shortMessage?: string
      message?: string
      stderr?: string
      stdout?: string
    }
    return maybeError.shortMessage
      ?? maybeError.message
      ?? maybeError.stderr
      ?? maybeError.stdout
      ?? String(error)
  }
  return String(error)
}

async function createProjectReport(
  project: CompareProject,
  options: CreateProjectReportOptions = {},
): Promise<AppsGeneratorCompareReportItem> {
  let generatorResult: GeneratorBuildResult
  try {
    generatorResult = await buildProject(project)
  }
  catch (error) {
    return {
      name: project.name,
      fixture: 'demo',
      platform: project.platform,
      allowedPlatforms: project.allowedPlatforms,
      cssFile: project.cssFile,
      cssFiles: [project.cssFile],
      status: 'failed',
      error: normalizeError(error),
    }
  }

  await options.onPassed?.({
    generatorResult,
  })
  expectNoMiniProgramSpecificityPlaceholders(project, generatorResult)

  return createReportItem(project, generatorResult)
}

async function expectReportSnapshot(report: AppsGeneratorCompareReportItem[]) {
  const jsonSnapshotPath = await resolveSnapshotFile(__dirname, 'apps-generator-mode', 'compare', 'report.json')
  const completeReport = projectFilterEnabled
    ? mergeScopedGeneratorReport(JSON.parse(await fs.readFile(jsonSnapshotPath, 'utf8')), report)
    : report
  await clearSnapshotDirOnUpdate('apps-generator-mode', 'compare')
  const markdownSnapshotPath = await resolveSnapshotFile(__dirname, 'apps-generator-mode', 'compare', 'report.md')
  const chineseMarkdownSnapshotPath = await resolveSnapshotFile(__dirname, 'apps-generator-mode', 'compare', 'report.zh-CN.md')
  await expect(`${JSON.stringify(completeReport, null, 2)}\n`).toMatchFileSnapshot(jsonSnapshotPath)
  await expectNormalizedReportSnapshot(markdownSnapshotPath, createMarkdownReport(completeReport))
  await expectNormalizedReportSnapshot(chineseMarkdownSnapshotPath, createChineseMarkdownReport(completeReport))
}

async function expectNormalizedReportSnapshot(snapshotPath: string, content: string) {
  await expect(normalizeReportSnapshotText(content)).toMatchFileSnapshot(snapshotPath)
}

function normalizeReportSnapshotText(source: string) {
  const normalized = source
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
  return `${normalized}\n`
}

function normalizeCssSnapshot(css: string) {
  return normalizeCssTextSnapshot(css)
}

const GENERATED_CSS_SOURCE_MARKER_RE = /(\/\*!\s*weapp-tailwindcss vite-generated-css(?:-end)?:)([^\s*]+)(\s*\*\/)/g

function normalizeGeneratedCssSourceMarkers(css: string) {
  return css.replace(GENERATED_CSS_SOURCE_MARKER_RE, (match, prefix, encodedSource, suffix) => {
    try {
      const source = decodeURIComponent(encodedSource).replaceAll('\\', '/')
      const demoIndex = source.lastIndexOf('/demo/')
      if (demoIndex < 0) {
        return match
      }
      return `${prefix}${encodeURIComponent(source.slice(demoIndex + 1))}${suffix}`
    }
    catch {
      return match
    }
  })
}

const TARO_WEBPACK_V4_NUTUI_NOISE_KEYFRAMES = new Set([
  'rotation',
  'nutJump',
  'nutJumpOne',
  'nutBlink',
  'nutBreathe',
  'nutFlash',
  'nutBounce',
  'nutShake',
])

function shouldNormalizeTaroWebpackV4IndependentNutuiNoise(project: CompareProject, fileName: string) {
  return project.name === 'taro-webpack-react-tailwindcss-v4'
    && normalizeOutputCssFileName(fileName) === 'sub-independent/pages/index.wxss'
}

function shouldNormalizeProjectCssSnapshots(project: CompareProject) {
  return project.name === 'taro-webpack-react-tailwindcss-v4'
}

function shouldRemoveTaroWebpackV4WebSubpackageNoise(project: CompareProject, fileName: string) {
  return project.name === 'taro-webpack-react-tailwindcss-v4'
    && isH5WebProject(project)
    && normalizeOutputCssFileName(fileName) === 'css/app.css'
}

function removeTaroWebpackV4WebSubpackageNoise(css: string) {
  try {
    const root = postcss.parse(css)
    root.walkRules((rule) => {
      if (
        rule.selectors.some(selector => /(?:normal|independent)_subpackage_taro-webpack-react-tailwindcss-v4/.test(selector))
        || rule.selectors.every(selector => selector === '.transform' || selector === '.ease-in-out')
      ) {
        const previous = rule.prev()
        if (previous?.type === 'comment' && previous.text.trim().startsWith('tokens:')) {
          previous.remove()
        }
        rule.remove()
      }
    })
    root.walkAtRules('property', (rule) => {
      if (rule.params.trim() === '--tw-ease') {
        rule.remove()
      }
    })
    root.walkDecls((decl) => {
      if (decl.prop === '--tw-ease' || decl.prop === '--ease-in-out') {
        decl.remove()
      }
    })
    return normalizeCssSnapshot(root.toString())
  }
  catch {
    return css
  }
}

function removeTaroWebpackV4IndependentNutuiNoise(css: string) {
  try {
    const root = postcss.parse(css)
    root.walkDecls((decl) => {
      if (
        decl.prop.startsWith('--nut-icon-')
        || decl.prop === '--animate-duration'
        || decl.prop === '--animate-delay'
      ) {
        decl.remove()
      }
    })
    root.walkRules((rule) => {
      if ((rule.selectors ?? [rule.selector]).every(selector => /(?:^|[\s>+~])\.nut-icon[\w-]*(?:$|[\s.#:[>+~])/.test(selector))) {
        rule.remove()
      }
    })
    root.walkAtRules('keyframes', (rule) => {
      if (TARO_WEBPACK_V4_NUTUI_NOISE_KEYFRAMES.has(rule.params)) {
        rule.remove()
      }
    })
    return normalizeCssSnapshot(root.toString())
  }
  catch {
    return css
  }
}

function normalizeProjectCssSnapshot(project: CompareProject, snapshot: GeneratorCssSnapshot) {
  let normalized = normalizeCssSnapshot(normalizeGeneratedCssSourceMarkers(snapshot.content))
  if (shouldRemoveTaroWebpackV4WebSubpackageNoise(project, snapshot.fileName)) {
    normalized = removeTaroWebpackV4WebSubpackageNoise(normalized)
  }
  if (shouldNormalizeTaroWebpackV4IndependentNutuiNoise(project, snapshot.fileName)) {
    normalized = removeTaroWebpackV4IndependentNutuiNoise(normalized)
  }
  return normalized
}

function formatAllowedPlatforms(platforms: string[]) {
  if (platforms.length === 0) {
    return '-'
  }
  return platforms.map(platform => `\`${platform.replaceAll('|', '\\|')}\``).join(', ')
}

function getCssArtifactFileName(fileName: string) {
  const normalized = normalizeOutputCssFileName(fileName).replace(/^\.\//, '')
  const withoutQuery = normalized.replace(/[?#].*$/, '')
  const safeFileName = withoutQuery
    .split('/')
    .filter(Boolean)
    .map(segment => segment.replace(/[^\w.-]/g, '-'))
    .join('__')
  return safeFileName || 'output.css'
}

function createCssArtifactSnapshot(project: CompareProject, snapshot: GeneratorCssSnapshot) {
  return `${normalizeProjectCssSnapshot(project, snapshot).trimEnd()}\n`
}

function createNormalizedGeneratorCss(
  project: CompareProject,
  generatorResult: Pick<GeneratorBuildResult, 'css' | 'cssFiles'> & Partial<Pick<GeneratorBuildResult, 'cssSnapshots'>>,
) {
  if (shouldNormalizeProjectCssSnapshots(project)) {
    return createStableCssSnapshots(generatorResult, project.cssFile, {
      structureIdentity: isWebStyleDirectoryProject(project),
    })
      .map(snapshot => normalizeProjectCssSnapshot(project, snapshot))
      .join('\n')
  }
  return normalizeCssSnapshot(normalizeGeneratedCssSourceMarkers(generatorResult.css))
}

function createCssOutputSnapshot(
  project: CompareProject,
  generatorResult: Pick<GeneratorBuildResult, 'css' | 'cssFiles'> & Partial<Pick<GeneratorBuildResult, 'cssSnapshots'>>,
) {
  const stableCssSnapshots = createStableCssSnapshots(generatorResult, project.cssFile, {
    structureIdentity: isWebStyleDirectoryProject(project),
  })
  const generatorCss = createNormalizedGeneratorCss(project, generatorResult)
  const generator = summarizeCss(`${generatorCss}\n`)
  const cssSummaryRows = stableCssSnapshots.flatMap((snapshot) => {
    const summary = summarizeCss(`${normalizeProjectCssSnapshot(project, snapshot)}\n`)
    const artifactFile = `artifacts/${getCssArtifactFileName(snapshot.fileName)}`
    return [
      `| \`${snapshot.fileName}\` | [${artifactFile}](${artifactFile}) | ${summary.bytes} | ${summary.selectors.length} | ${summary.hasSupports} | ${summary.hasHoverPseudo} | ${summary.hasTailwindBanner} | ${summary.hasSystemDarkModeMedia} | ${summary.hasManualDarkModeSelector} | ${summary.hasRawArbitrarySelector} | ${summary.hasWeappEscapedArbitrarySelector} |`,
    ]
  })
  const cssFileRows = stableCssSnapshots.map((snapshot, index) => {
    const artifactFile = `artifacts/${getCssArtifactFileName(snapshot.fileName)}`
    return `| ${index + 1} | \`${snapshot.fileName}\` | [${artifactFile}](${artifactFile}) |`
  })
  return [
    `# ${project.name} CSS Output`,
    '',
    'Fixture: demo',
    `Platform: ${project.platform}`,
    `Allowed platforms: ${formatAllowedPlatforms(project.allowedPlatforms)}`,
    `Entry: ${project.cssFile}`,
    '',
    '| Bytes | Selectors | @supports | :hover | Tailwind banner | System dark media | Manual dark selector | Raw arbitrary selector | Weapp escaped arbitrary selector |',
    '| ---: | ---: | --- | --- | --- | --- | --- | --- | --- |',
    `| ${generator.bytes} | ${generator.selectors.length} | ${generator.hasSupports} | ${generator.hasHoverPseudo} | ${generator.hasTailwindBanner} | ${generator.hasSystemDarkModeMedia} | ${generator.hasManualDarkModeSelector} | ${generator.hasRawArbitrarySelector} | ${generator.hasWeappEscapedArbitrarySelector} |`,
    '',
    '## Generator CSS Files',
    '',
    '| # | File | Artifact |',
    '| ---: | --- | --- |',
    ...cssFileRows,
    '',
    '## Generator CSS Summary',
    '',
    '| File | Artifact | Bytes | Selectors | @supports | :hover | Tailwind banner | System dark media | Manual dark selector | Raw arbitrary selector | Weapp escaped arbitrary selector |',
    '| --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- |',
    ...cssSummaryRows,
  ].join('\n')
}

async function expectCssOutputSnapshot(
  project: CompareProject,
  generatorResult: GeneratorBuildResult,
) {
  await clearSnapshotDirOnUpdate('apps-generator-mode', 'css-output', project.platform, project.name)
  const snapshotPath = await resolveSnapshotFile(__dirname, 'apps-generator-mode', 'css-output', path.join(project.platform, project.name, 'README.md'))
  await expectNormalizedReportSnapshot(snapshotPath, createCssOutputSnapshot(project, generatorResult))
  for (const snapshot of createStableCssSnapshots(generatorResult, project.cssFile, {
    structureIdentity: isWebStyleDirectoryProject(project),
  })) {
    const artifactPath = await resolveSnapshotFile(
      __dirname,
      'apps-generator-mode',
      'css-output',
      path.join(project.platform, project.name, 'artifacts', getCssArtifactFileName(snapshot.fileName)),
    )
    await expect(createCssArtifactSnapshot(project, snapshot)).toMatchFileSnapshot(artifactPath)
  }
}

describe('demo generator mode output', () => {
  it.each(['', '-end'])('normalizes generated css source markers %s across checkout locations', (suffix) => {
    const source = 'demo/taro-vite-react-tailwindcss-v4/src/app.css'
    const expected = `/*! weapp-tailwindcss vite-generated-css${suffix}:${encodeURIComponent(source)} */`

    for (const absoluteSource of [
      `/Users/example/project/${source}`,
      `/home/runner/work/project/${source}`,
      `C:\\workspace\\project\\${source.replaceAll('/', '\\')}`,
    ]) {
      const marker = `/*! weapp-tailwindcss vite-generated-css${suffix}:${encodeURIComponent(absoluteSource)} */`
      expect(normalizeGeneratedCssSourceMarkers(marker)).toBe(expected)
    }

    expect(normalizeGeneratedCssSourceMarkers('/*! weapp-tailwindcss vite-generated-css:%E0%A4%A */'))
      .toBe('/*! weapp-tailwindcss vite-generated-css:%E0%A4%A */')
  })

  it('normalizes generated css source markers before aggregate metrics', () => {
    const project: CompareProject = {
      name: 'taro-vite-react-tailwindcss-v4',
      fixturesDir: '../demo',
      rootDir: 'taro-vite-react-tailwindcss-v4',
      platform: 'web',
      allowedPlatforms: ['h5'],
      cssFile: 'dist',
      cssPath: 'dist',
      requiredCssFiles: [],
      buildScript: 'build:h5',
      cssSnapshotMode: 'directory',
      cssPattern: WEB_CSS_PATTERN,
    }
    const source = 'demo/taro-vite-react-tailwindcss-v4/src/app.css'
    const createGeneratorResult = (absoluteSource: string): GeneratorBuildResult => {
      const css = `/*! weapp-tailwindcss vite-generated-css:${encodeURIComponent(absoluteSource)} */\n.example { color: red; }\n/*! weapp-tailwindcss vite-generated-css-end:${encodeURIComponent(absoluteSource)} */`
      return {
        css,
        cssFiles: ['css/index.css'],
        cssSnapshots: [{ fileName: 'css/index.css', content: css }],
      }
    }

    const macResult = createGeneratorResult(`/Users/example/project/${source}`)
    const expectedOutput = createCssOutputSnapshot(project, macResult)
    const expectedReportItem = createReportItem(project, macResult)
    for (const absoluteSource of [
      `/home/runner/work/project/${source}`,
      `C:\\workspace\\project\\${source.replaceAll('/', '\\')}`,
    ]) {
      const result = createGeneratorResult(absoluteSource)
      expect(createCssOutputSnapshot(project, result)).toBe(expectedOutput)
      expect(createReportItem(project, result)).toEqual(expectedReportItem)
    }
  })

  it('collects nested selectors and normalizes unsupported pseudo aliases', () => {
    expect(collectSelectors([
      '@media (prefers-color-scheme: dark) {',
      '  .dark_cbg-zinc-800 { color: black; }',
      '  .before_ccontent-_b_qx_q_B::before { content: "x"; }',
      '}',
      'view,text,:before,:after { box-sizing: border-box; }',
      '.bg-red-500 { color: red; }',
      '::-webkit-calendar-picker-indicator { display: none; }',
      '[hidden]:where(:not([hidden=\'until-found\'])) { display: none; }',
      '.nut-input .weui-input::placeholder { color: gray; }',
      'a,button,input:where([type=\'button\'], [type=\'reset\'], [type=\'submit\']) { font: inherit; }',
      'ul,textarea,video { display: block; }',
      '.prose .a { color: inherit; }',
      '.nut-video video { width: 100%; }',
    ].join('\n'))).toEqual([
      '.before_ccontent-_b_qx_q_B:before',
      '.bg-red-500',
      '.dark_cbg-zinc-800',
      '.nut-input .weui-input::placeholder',
      '.nut-video video',
      '.prose .a',
    ])
  })

  it('does not normalize cascade layer specificity placeholders out of selectors', () => {
    expect(collectSelectors('.bg-red-500:not(#\\#):not(#n) { color: red; }')).toEqual([
      '.bg-red-500:not(#\\#):not(#n)',
    ])
  })

  it('prints css metrics before raw css output blocks', async () => {
    const snapshot = await createCssOutputSnapshot({
      name: 'fixture-app',
      fixturesDir: '../demo',
      rootDir: 'fixture-app',
      platform: 'mp-weixin',
      allowedPlatforms: ['mp-weixin', 'h5'],
      cssFile: 'fixture-app/dist/app.wxss',
      cssPath: 'dist/app.wxss',
      requiredCssFiles: ['fixture-app/dist/app.wxss'],
      buildScript: 'build',
      cssSnapshotMode: 'entry',
      cssPattern: MINI_PROGRAM_CSS_PATTERN,
    }, {
      css: '.generator { color: blue; }\n.shared { display: block; }\n',
      cssFiles: ['app.wxss', 'pages/index/index.wxss'],
      cssSnapshots: [
        { fileName: 'app.wxss', content: '.generator { color: blue; }\n' },
        { fileName: 'pages/index/index.wxss', content: '.shared { display: block; }\n' },
      ],
    })

    const generatorCssIndex = snapshot.indexOf('\n## Generator CSS\n')
    const cssTableIndex = snapshot.indexOf('| File | Bytes |')
    const firstCssBlockIndex = snapshot.indexOf('### app.wxss')

    expect(snapshot.indexOf('| Bytes |')).toBeGreaterThanOrEqual(0)
    expect(generatorCssIndex).toBe(-1)
    expect(cssTableIndex).toBe(-1)
    expect(firstCssBlockIndex).toBe(-1)
    expect(snapshot).toContain('# fixture-app CSS Output')
    expect(snapshot).toContain('Platform: mp-weixin')
    expect(snapshot).toContain('Allowed platforms: `mp-weixin`, `h5`')
    expect(snapshot).toContain('| 56 | 2 | false | false | false | false | false | false | false |')
    expect(snapshot).not.toContain('Generator CSS files:')
    expect(snapshot).toContain('## Generator CSS Files')
    expect(snapshot).toContain('| # | File | Artifact |')
    expect(snapshot).toContain('| 1 | `app.wxss` | [artifacts/app.wxss](artifacts/app.wxss) |')
    expect(snapshot).toContain('| 2 | `pages/index/index.wxss` | [artifacts/pages__index__index.wxss](artifacts/pages__index__index.wxss) |')
    expect(snapshot).toContain('| `app.wxss` | [artifacts/app.wxss](artifacts/app.wxss) | 28 | 1 | false | false | false | false | false | false | false |')
    expect(snapshot).toContain('| `pages/index/index.wxss` | [artifacts/pages__index__index.wxss](artifacts/pages__index__index.wxss) | 28 | 1 | false | false | false | false | false | false | false |')
    expect(snapshot).not.toContain('.generator { color: blue; }')
  })

  it('dedupes imported hashed css files from generator output snapshots', async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), '.tmp-mpx-css-snapshots-'))
    const outputRoot = path.join(root, 'dist/wx')
    await fs.mkdir(path.join(outputRoot, 'styles'), { recursive: true })
    await fs.writeFile(path.join(outputRoot, 'app.wxss'), '@import "./styles/app3b4a1ac6.wxss";\n')
    await fs.writeFile(path.join(outputRoot, 'styles/app3b4a1ac6.wxss'), '.from-mpx{color:red}\n')

    try {
      const snapshots = await collectOutputCssSnapshots(root, {
        name: 'fixture-app',
        fixturesDir: '../demo',
        rootDir: 'fixture-app',
        platform: 'wx',
        allowedPlatforms: ['wx'],
        cssFile: 'dist/wx/app.wxss',
        cssPath: 'dist/wx/app.wxss',
        requiredCssFiles: ['dist/wx/app.wxss'],
        buildScript: 'build',
        cssSnapshotMode: 'entry',
        cssPattern: MINI_PROGRAM_CSS_PATTERN,
      })
      expect(snapshots.map(snapshot => snapshot.fileName)).toEqual([
        'app.wxss',
        'styles/app.wxss',
      ])
    }
    finally {
      await fs.rm(root, { force: true, recursive: true })
    }
  })

  it('normalizes hashed css output file order for snapshots', () => {
    expect([
      'index866b3e7e.wxss',
      'base29252032.wxss',
      'index573acbe4.wxss',
      'components94caae12.wxss',
    ].sort(compareCssOutputFile)).toEqual([
      'base29252032.wxss',
      'components94caae12.wxss',
      'index573acbe4.wxss',
      'index866b3e7e.wxss',
    ])

    expect([
      { fileName: 'index.wxss', content: '.b{}' },
      { fileName: 'index.wxss', content: '.a{}' },
      { fileName: 'base.wxss', content: '.z{}' },
    ].sort(compareCssSnapshotEntry)).toEqual([
      { fileName: 'base.wxss', content: '.z{}' },
      { fileName: 'index.wxss', content: '.a{}' },
      { fileName: 'index.wxss', content: '.b{}' },
    ])

    expect(createStableCssSnapshots({
      css: '',
      cssFiles: ['css/471.css', 'css/539.css', 'css/app.css'],
      cssSnapshots: [
        { fileName: 'css/471.css', content: '.b{}' },
        { fileName: 'css/539.css', content: '.a{}' },
        { fileName: 'css/app.css', content: '.app{}' },
      ],
    }, 'dist')).toEqual([
      { fileName: 'css/chunk.2.css', content: '.b{}' },
      { fileName: 'css/chunk.1.css', content: '.a{}' },
      { fileName: 'css/app.css', content: '.app{}' },
    ])
  })

  it('keeps hashed web css snapshot names stable across declaration value changes', () => {
    const createSnapshots = (pageColor: string) => createStableCssSnapshots({
      css: '',
      cssFiles: ['css/index.page-hash.css', 'css/index.admin-hash.css'],
      cssSnapshots: [
        { fileName: 'css/index.page-hash.css', content: `.shared{color:${pageColor}}.page{display:block}` },
        { fileName: 'css/index.admin-hash.css', content: '.shared{color:blue}.admin{display:block}' },
      ],
    }, 'dist', { structureIdentity: true })

    const before = createSnapshots('red')
    const after = createSnapshots('aqua')
    const findPageFile = (snapshots: GeneratorCssSnapshot[]) => snapshots.find(snapshot => snapshot.content.includes('.page{'))?.fileName

    expect(findPageFile(before)).toBe('css/index.2.css')
    expect(findPageFile(after)).toBe(findPageFile(before))
  })

  it('keeps Taro webpack web subpackage utilities out of the main css snapshot', () => {
    const project = createH5CompareProject(
      createCompareProject(E2E_PROJECTS.find(item => item.name === 'taro-webpack-react-tailwindcss-v4')!),
      { platform: 'web', buildEnv: {} },
    )
    const normalized = normalizeProjectCssSnapshot(project, {
      fileName: 'css/app.css',
      content: [
        '.main { color: red; }',
        '/* tokens: transform <= src/app.css */',
        '.transform { transform: translate(0); }',
        '/* tokens: ease-in-out <= src/app.css */',
        '.ease-in-out { transition-timing-function: ease-in-out; }',
        '@property --tw-ease { syntax: "*"; inherits: false; }',
        '*,::before,::after { --tw-ease: initial; color: inherit; }',
        ':root { --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1); }',
        String.raw`.before\:content-\[\'normal_subpackage_taro-webpack-react-tailwindcss-v4\'\] { content: 'normal'; }`,
        String.raw`.before\:content-\[\'independent_subpackage_taro-webpack-react-tailwindcss-v4\'\] { content: 'independent'; }`,
      ].join('\n'),
    })

    expect(normalized).toContain('.main')
    expect(normalized).not.toContain('.transform')
    expect(normalized).not.toContain('.ease-in-out')
    expect(normalized).not.toContain('tokens: transform')
    expect(normalized).not.toContain('tokens: ease-in-out')
    expect(normalized).not.toContain('@property --tw-ease')
    expect(normalized).not.toContain('--tw-ease')
    expect(normalized).not.toContain('--ease-in-out')
    expect(normalized).toContain('color: inherit')
    expect(normalized).not.toContain('normal_subpackage_taro-webpack-react-tailwindcss-v4')
    expect(normalized).not.toContain('independent_subpackage_taro-webpack-react-tailwindcss-v4')
  })

  it('builds retained demos with generator mini-program, H5 web, and App style css output', async () => {
    const report: AppsGeneratorCompareReportItem[] = []

    for (const project of projects) {
      let generatorResult: GeneratorBuildResult | undefined
      const item = await createProjectReport(project, {
        onPassed(result) {
          generatorResult = result.generatorResult
        },
      })
      report.push(item)
      if (item.status === 'failed') {
        continue
      }

      expect(item.generator.bytes, `${project.name} ${project.platform} generator css should not be empty`).toBeGreaterThan(0)
      if (isMiniProgramProject(project)) {
        expect(item.generator.hasTailwindBanner, `${project.name} generator css should not keep raw Tailwind banner`).toBe(false)
        expect(item.generator.hasSupports, `${project.name} generator css should remove unsupported @supports`).toBe(false)
        expect(item.generator.hasHoverPseudo, `${project.name} generator css should remove unsupported :hover`).toBe(false)
        expect(item.generator.hasSystemDarkModeMedia, `${project.name} generator css should include system dark mode`).toBe(true)
        expect(item.generator.hasManualDarkModeSelector, `${project.name} generator css should include manual theme-dark class mode`).toBe(true)
        expect(item.generator.hasUnsupportedThemeAttributeSelector, `${project.name} generator css should not include theme attribute selectors`).toBe(false)
        expect(item.generator.hasUnsupportedThemeComplexSelector, `${project.name} generator css should not include theme :where/:not selectors`).toBe(false)
        expect(item.generator.hasWeappEscapedArbitrarySelector || !item.generator.hasRawArbitrarySelector).toBe(true)
      }
      if (generatorResult) {
        if (isMiniProgramProject(project)) {
          expectWeappViteTailwindV4CssIsolation(project, generatorResult)
          expectSubpackageCssFiles(project, generatorResult)
          expectSubpackageMarkersInGeneratedCss(project, generatorResult)
          expectPackageCssIsolation(project, generatorResult)
          expectWeappViteAppCssInlined(project, generatorResult)
          expectUserImportedUiCssMarkers(project, generatorResult)
        }
        expectWebStyleDirectoryCss(project, generatorResult)
        await expectCssOutputSnapshot(project, generatorResult)
      }
    }

    expect(report.filter(item => item.status === 'failed')).toEqual([])
    const artifactRoot = path.resolve(__dirname, '.artifacts', 'apps-generator-mode')
    await fs.mkdir(artifactRoot, { recursive: true })
    await fs.writeFile(path.join(artifactRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    await expectReportSnapshot(report)
  }, 1_800_000)
})
