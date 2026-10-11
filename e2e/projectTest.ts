import type { ProjectEntry } from './shared'
import fs from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { closeWechatProject } from '../scripts/wechat-project-cleanup'
import { Launcher } from '../scripts/wechat/automator'
import { collectEmptyCssBlocks } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/css-integrity'
import { ensureProjectBuilt } from './projectBuild'
import { isE2EProjectSupportedOnPlatform } from './projectEntries'
import { clearTailwindPatchTaskCache, collectCssSnapshots, formatWxml, getProjectCssSnapshotFiles, logE2EError, projectFilter, removeWxmlId, resolveSnapshotFile, twExtract, twPatch, wait } from './shared'
import { formatRawCssSnapshotText, normalizeCssTextSnapshot } from './snapshotUtils'
import { collectTokenSourceReports, formatTokenSourceFileReport } from './tokenSourceReports'

export { ensureProjectBuilt } from './projectBuild'

const EPERM_RE = /EPERM/i
const MINI_PROGRAM_STYLE_OUTPUT_RE = /\.(?:acss|css|jxss|qss|ttss|wxss)$/i
const automator = new Launcher()
const cleanedProjectSnapshotDirs = new Set<string>()

interface ProjectTestOptions {
  suite: string
  fixturesDir: string
  describeTitle?: string
  allowExtractionFailure?: boolean
}

interface StableWxmlOptions {
  timeoutMs?: number
  intervalMs?: number
  stableRounds?: number
  settleMs?: number
}

const ISSUE_909_CLASS_LIST = [
  '-rotate-y-45',
  'h-8',
  'rotate-x-45',
  'rotate-y-45',
  'rotate-y-90',
  'rotate-z-45',
  'w-8',
]

const ISSUE_909_CSS_SELECTORS = new Set([
  '.h-8',
  '.w-8',
  '.rotate-x-45',
  '.-rotate-y-45',
  '.rotate-y-45',
  '.rotate-y-90',
  '.rotate-z-45',
])

async function safeRm(target: string) {
  try {
    await fs.rm(target, { recursive: true, force: true })
  }
  catch (error: any) {
    const code = error?.code
    if (!(code && ['ENOENT', 'EPERM', 'EBUSY', 'ENOTEMPTY'].includes(code))) {
      throw error
    }
  }
}

async function collectMiniProgramStyleOutputs(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
  const files = await Promise.all(entries.map(async (entry) => {
    const file = path.resolve(directory, entry.name)
    if (entry.isDirectory()) {
      return collectMiniProgramStyleOutputs(file)
    }
    return entry.isFile() && MINI_PROGRAM_STYLE_OUTPUT_RE.test(entry.name) ? [file] : []
  }))
  return files.flat()
}

function isUpdatingSnapshots() {
  return expect.getState().snapshotState?.snapshotUpdateState === 'all'
}

async function clearProjectSnapshotDirOnUpdate(suite: string, projectName: string) {
  if (!isUpdatingSnapshots()) {
    return
  }

  const snapshotDir = path.resolve(__dirname, '__snapshots__', suite, projectName)
  if (cleanedProjectSnapshotDirs.has(snapshotDir)) {
    return
  }

  cleanedProjectSnapshotDirs.add(snapshotDir)
  await safeRm(snapshotDir)
}

async function clearTailwindPatchCaches(root: string, options: { includeBuildOutputs?: boolean } = {}) {
  const workspaceRoot = path.resolve(root, '..', '..')
  const candidates = new Set<string>([
    path.resolve(root, '.cache'),
    path.resolve(root, 'node_modules/.cache/tailwindcss-patch'),
    path.resolve(root, 'node_modules/.cache/weapp-tailwindcss'),
    path.resolve(root, 'node_modules/.cache/@tailwindcss-mangle'),
    path.resolve(root, 'src/node_modules/.cache/tailwindcss-patch'),
    path.resolve(root, 'src/node_modules/.cache/weapp-tailwindcss'),
    path.resolve(root, 'src/node_modules/.cache/@tailwindcss-mangle'),
    path.resolve(root, 'config/node_modules/.cache/tailwindcss-patch'),
    path.resolve(root, 'config/node_modules/.cache/weapp-tailwindcss'),
    path.resolve(root, 'config/node_modules/.cache/@tailwindcss-mangle'),
    path.resolve(root, '.tw-patch/tailwindcss-target.json'),
    path.resolve(root, 'node_modules/.vite'),
    path.resolve(workspaceRoot, 'node_modules/.cache/tailwindcss-patch'),
    path.resolve(workspaceRoot, 'node_modules/.cache/weapp-tailwindcss'),
    path.resolve(workspaceRoot, 'node_modules/.cache/@tailwindcss-mangle'),
    path.resolve(workspaceRoot, 'packages/weapp-tailwindcss/node_modules/.cache/tailwindcss-patch'),
    path.resolve(workspaceRoot, 'packages/weapp-tailwindcss/node_modules/.cache/weapp-tailwindcss'),
    path.resolve(workspaceRoot, 'packages/weapp-tailwindcss/node_modules/.cache/@tailwindcss-mangle'),
  ])

  if (options.includeBuildOutputs) {
    candidates.add(path.resolve(root, 'dist'))
    candidates.add(path.resolve(root, 'unpackage'))
  }

  await Promise.all(
    Array.from(candidates, target => safeRm(target)),
  )
}

export async function clearProjectBuildState(root: string) {
  clearTailwindPatchTaskCache(root)
  await clearTailwindPatchCaches(root, { includeBuildOutputs: true })
}

function shouldSkipAutomator(entry: ProjectEntry) {
  if (entry.skipOpenAutomator) {
    return true
  }
  if (process.env['E2E_SKIP_OPEN_AUTOMATOR'] === '1') {
    return true
  }
  if (process.env.E2E_OPEN_AUTOMATOR === '1') {
    return false
  }
  return process.env.CI === 'true' || process.env.CI === '1'
}

async function expectProjectSnapshot(suite: string, projectName: string, fileName: string, content: string) {
  const snapshotPath = await resolveSnapshotFile(__dirname, suite, projectName, fileName)
  await expect(await normalizeProjectSnapshotContent(fileName, content)).toMatchFileSnapshot(snapshotPath)
}

function shouldCollectIssue909TransformSnapshot(entry: ProjectEntry) {
  return entry.extraSnapshots?.includes('issue-909-transform') === true
}

function normalizeIssue909ClassListSnapshot(classList: string[]) {
  const classSet = new Set(classList)
  return ISSUE_909_CLASS_LIST.filter(className => classSet.has(className))
}

function normalizeIssue909CssSnapshot(source: string) {
  const sections: string[] = []
  const rootRuleMatch = source.match(/:host,\npage,\n\.tw-root,\nwx-root-portal-content \{[\s\S]*?\n\}/)
  if (rootRuleMatch) {
    const rootRule = rootRuleMatch[0]
      .split('\n')
      .filter((line) => {
        return /^(?::host,|page,|\.tw-root,|wx-root-portal-content \{| {2}--spacing:| {2}--tw-rotate-[xyz]:| {2}--tw-skew-[xy]:|\})/.test(line)
      })
      .join('\n')
    sections.push(rootRule)
  }

  const rulePattern = /(?:^|\n)((?:\/\* tokens:[^\n]* \*\/\n)?)(\.[^{]+ \{[\s\S]*?\n\})/g
  for (const match of source.matchAll(rulePattern)) {
    const comment = match[1] ?? ''
    const rule = match[2]
    const selector = rule?.slice(0, rule.indexOf(' {'))
    if (selector && ISSUE_909_CSS_SELECTORS.has(selector)) {
      sections.push(`${comment}${rule}`)
    }
  }

  return sections.join('\n')
}

function normalizeIssue909WxmlSnapshot(source: string) {
  return source.replace(/\s+style="[^"]*"/g, '')
}

async function normalizeProjectSnapshotContent(fileName: string, source: string) {
  if (/\.(?:wxss|css)$/.test(fileName)) {
    return formatRawCssSnapshotText(source)
  }

  const normalized = source
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
  return `${normalized}\n`
}

function formatClassListSnapshot(classList: string[]) {
  return `${JSON.stringify(classList, null, 2)}\n`
}

const SUSPICIOUS_CLASS_FRAGMENT_RE = /\b[\w-]+-\s+[a-z0-9#]/gi
const SUSPICIOUS_XL_FRAGMENT_RE = /\b\d+xl\s+\d+xl\b/gi

function collectSuspiciousClassFragments(wxml: string) {
  const matches: string[] = []
  const patterns = [
    SUSPICIOUS_CLASS_FRAGMENT_RE,
    SUSPICIOUS_XL_FRAGMENT_RE,
  ]

  for (const pattern of patterns) {
    pattern.lastIndex = 0
    matches.push(...(wxml.match(pattern) ?? []))
  }

  return [...new Set(matches)]
}

function countSuspiciousClassFragments(wxml: string) {
  return collectSuspiciousClassFragments(wxml).length
}

async function captureStablePageWxml(
  page: any,
  options: StableWxmlOptions = {},
) {
  const timeoutMs = options.timeoutMs ?? 3000
  const intervalMs = options.intervalMs ?? 120
  const stableRounds = options.stableRounds ?? 2
  const settleMs = options.settleMs ?? 800
  const deadline = Date.now() + timeoutMs

  if (settleMs > 0) {
    await page.waitFor(settleMs)
  }

  let latest = ''
  let previous = ''
  let stableCount = 0
  let best = ''
  let bestScore = Number.POSITIVE_INFINITY

  while (Date.now() < deadline) {
    const pageEl = await page.$('page')
    const current = await pageEl?.wxml() ?? ''
    latest = current
    const suspiciousScore = countSuspiciousClassFragments(current)

    if (
      current.length > 0
      && (suspiciousScore < bestScore || (suspiciousScore === bestScore && current !== best))
    ) {
      best = current
      bestScore = suspiciousScore
    }

    if (current.length > 0 && current === previous) {
      stableCount += 1
      if (stableCount >= stableRounds && suspiciousScore === 0) {
        return current
      }
    }
    else {
      stableCount = 0
      previous = current
    }

    await page.waitFor(intervalMs)
  }

  return best || latest
}

async function relaunchPageWithRetry(miniProgram: any, pageUrl: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      const page = await miniProgram.reLaunch(pageUrl)
      if (page) {
        return page
      }
    }
    catch (error) {
      lastError = error
    }
    await wait(1000)
  }

  throw new Error(`Failed to relaunch page for ${pageUrl}: ${String(lastError ?? 'unknown error')}`)
}

async function runProjectTest(entry: ProjectEntry, options: ProjectTestOptions) {
  const projectBase = path.resolve(__dirname, options.fixturesDir)
  const projectPath = path.resolve(projectBase, entry.projectPath)
  const root = path.resolve(projectBase, entry.name)
  const shouldResetPatchCaches = !entry.name.startsWith('taro-')

  await clearProjectBuildState(root)
  await clearProjectSnapshotDirOnUpdate(options.suite, entry.name)

  await twPatch(root)

  if (process.env.E2E_SKIP_BUILD !== '1') {
    await ensureProjectBuilt(root, { env: entry.buildEnv })
  }

  if (shouldResetPatchCaches) {
    await clearTailwindPatchCaches(root)
  }

  let extraction
  if (options.allowExtractionFailure) {
    try {
      extraction = await twExtract(root)
    }
    catch {
      extraction = undefined
    }
  }
  else {
    extraction = await twExtract(root)
  }

  const outputFilename = extraction?.output?.filename ?? path.resolve(root, '.tw-patch/tw-class-list.json')
  const classListSnapshot = extraction?.classList ? formatClassListSnapshot(extraction.classList) : undefined

  let json: string
  let classList: string[]
  if (classListSnapshot) {
    json = classListSnapshot
    classList = extraction.classList
  }
  else {
    try {
      json = await fs.readFile(outputFilename, 'utf8')
      const parsed = JSON.parse(json)
      classList = Array.isArray(parsed) ? parsed : []
    }
    catch (error: any) {
      const code = error?.code
      if (code && ['ENOENT', 'EPERM'].includes(code)) {
        json = formatClassListSnapshot([])
        classList = []
      }
      else {
        throw error
      }
    }
  }

  await expectProjectSnapshot(options.suite, entry.name, 'tw-class-list.json', json)
  const tokenSourceCollection = await collectTokenSourceReports(root, classList)
  const tokenSources = tokenSourceCollection?.tokenSources
  for (const report of tokenSourceCollection?.sourceReports ?? []) {
    await expectProjectSnapshot(options.suite, entry.name, `${report.file}.json`, formatTokenSourceFileReport(report))
  }
  if (shouldCollectIssue909TransformSnapshot(entry) && classList.length > 0) {
    await expectProjectSnapshot(
      options.suite,
      entry.name,
      'issue-909-transform/tw-class-list.json',
      formatClassListSnapshot(normalizeIssue909ClassListSnapshot(classList)),
    )
  }

  if (entry.forbidEmptyBlockAtRules) {
    const outputStyleRoot = path.dirname(path.resolve(projectPath, entry.cssFile))
    for (const file of await collectMiniProgramStyleOutputs(outputStyleRoot)) {
      const source = await fs.readFile(file, 'utf8')
      expect(
        collectEmptyCssBlocks(source),
        `${entry.name}/${path.relative(projectPath, file)} should not emit empty CSS blocks`,
      ).toEqual([])
    }
  }

  for (const cssEntry of getProjectCssSnapshotFiles(entry)) {
    const shouldNormalizeWebpackAppSplitNoise = (
      entry.name === 'taro-webpack-react-tailwindcss-v4'
      || entry.name === 'taro-webpack-vue3-tailwindcss-v4'
    ) && cssEntry.snapshotName.startsWith('sub-')
    const cssSnapshots = await collectCssSnapshots(projectPath, cssEntry.cssFile, {
      classList,
      normalizeWebpackAppSplitNoise: shouldNormalizeWebpackAppSplitNoise,
      normalizeTailwindV4RootVariableNoise: entry.name === 'taro-vite-react-tailwindcss-v4' || entry.name === 'taro-vite-vue3-tailwindcss-v4',
      rootSnapshotName: cssEntry.snapshotName,
      tokenSources,
    })
    for (const snapshot of cssSnapshots) {
      await expectProjectSnapshot(options.suite, entry.name, snapshot.fileName, snapshot.content)
      if (shouldCollectIssue909TransformSnapshot(entry) && snapshot.fileName === 'app.wxss') {
        await expectProjectSnapshot(
          options.suite,
          entry.name,
          'issue-909-transform/app.wxss',
          normalizeIssue909CssSnapshot(normalizeCssTextSnapshot(snapshot.content)),
        )
      }
    }
  }

  if (shouldSkipAutomator(entry)) {
    await wait()
    return
  }

  let miniProgram: any
  try {
    miniProgram = await automator.launch({ cliPath: process.env.E2E_PREFLIGHT_WECHAT_CLI,
      // cliPath: 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat',
      projectPath })
  }
  catch (error: any) {
    if (error?.code === 'EPERM' || EPERM_RE.test(error?.message ?? '')) {
      await wait()
      return
    }
    throw error
  }

  try {
    const pageUrl = entry.url ?? '/pages/index/index'
    const page = await relaunchPageWithRetry(miniProgram, pageUrl)

    if (page) {
      let wxml = await captureStablePageWxml(page)
      if (wxml) {
        wxml = removeWxmlId(wxml)
        try {
          wxml = await formatWxml(wxml)
        }
        catch {
          logE2EError('Failed to format WXML for %s', entry.projectPath)
        }

        const suspiciousFragments = collectSuspiciousClassFragments(wxml)
        if (suspiciousFragments.length > 0) {
          logE2EError(
            '[e2e] suspicious class fragments detected in %s/page.wxml: %s',
            entry.name,
            suspiciousFragments.join(', '),
          )
        }

        await expectProjectSnapshot(options.suite, entry.name, 'page.wxml', wxml)
        if (shouldCollectIssue909TransformSnapshot(entry)) {
          await expectProjectSnapshot(options.suite, entry.name, 'issue-909-transform/page.wxml', normalizeIssue909WxmlSnapshot(wxml))
        }
      }

      await page.waitFor(1000)
    }
  }
  finally {
    await closeWechatProject(projectPath, miniProgram)
  }

  await wait()
}

export function defineProjectTest(entry: ProjectEntry, options: ProjectTestOptions) {
  const filtered = projectFilter([entry])
  const activeEntry = filtered[0] ?? entry
  const register = filtered.length > 0 && isE2EProjectSupportedOnPlatform(activeEntry) ? it : it.skip
  const describeTitle = options.describeTitle ?? options.suite

  describe(describeTitle, () => {
    register(activeEntry.name, async () => {
      await runProjectTest(activeEntry, options)
    })
  })
}
