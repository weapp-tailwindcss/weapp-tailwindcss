import type { CoverageEvidence, CoverageResultStatus } from '../e2e/coverageReport'
import type { DemoCoverageEntry, DemoCoverageStatus, DemoPlatformCoverage } from '../e2e/demoCoverageMatrix'
import type { DemoE2eMemorySample, DemoE2eMemoryStepReport } from './demo-e2e-memory'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { collectCoverageIdentity } from '../e2e/coverageIdentity'
import { createCoverageReport, readCommittedCompatibilityEvidence } from '../e2e/coverageReport'
import { DEMO_COVERAGE_MATRIX } from '../e2e/demoCoverageMatrix'
import { createDemoE2eMemoryReport, sampleProcessTree, summarizeMemorySamples } from './demo-e2e-memory'
import { formatWorkflowError, runWithCleanup } from './e2e-preflight/cleanup'
import { enterFullTestGate } from './e2e-preflight/gate'

type StepStatus = 'passed' | 'failed' | 'skipped'

interface LocalFullRunStep {
  name: string
  command: string[]
  env?: Record<string, string>
  metric?: StepMetric
  artifactFiles?: Array<{
    from: string
    to: string
  }>
  artifactGlobs?: Array<{
    fromDir: string
    pattern: RegExp
    toDir: string
    recursive?: boolean
  }>
}

interface StepReport {
  name: string
  status: StepStatus
  command: string[]
  metric?: StepMetric
  startedAt?: string
  endedAt?: string
  exitCode?: number
  summary: ReturnType<typeof summarizeMemorySamples>
  copiedArtifacts: string[]
  reason?: string
}

interface LocalFullRunReport {
  generatedAt: string
  repositoryRoot: string
  profile: string
  steps: StepReport[]
  platformReports: PlatformCoverageReport[]
  summary: {
    stepCount: number
    passedStepCount: number
    failedStepCount: number
    skippedStepCount: number
    peakRssMb: number
    maxRssDeltaMb: number
  }
}

interface StepMetric {
  project: string
  platform: string
  stage: 'build' | 'hmr' | 'runtime'
  source: 'multiplatform-build' | 'hbuilderx-local' | 'uni-app-h5-dev'
}

interface PlatformMeasuredMetric {
  coverage: DemoCoverageStatus
  status: StepStatus | 'local' | 'exempt' | 'not-run'
  command?: string[]
  durationMs?: number
  peakRssMb?: number
  rssDeltaMb?: number
  e2eAvgMs?: number
  e2eP95Ms?: number
  e2eMaxMs?: number
  pluginMaxMs?: number
  pluginHeapPeakMb?: number
  source?: string
  reason?: string
}

interface PlatformCoverageReport {
  project: string
  framework: DemoCoverageEntry['framework']
  builder: string
  tailwindcss: DemoCoverageEntry['tailwindcss']
  platform: string
  build: PlatformMeasuredMetric
  hmr: PlatformMeasuredMetric
}

interface WeappMemorySummary {
  cases: Array<{
    name: string
    platform: string
    stages: Array<{
      stage: 'build' | 'hmr'
      status: StepStatus
      command: string[]
      reason?: string
      reportFile?: string
      summary: {
        peakRssMb: number
        rssDeltaMb: number
        durationMs: number
      }
    }>
  }>
}

interface HmrFullRunSummary {
  cases: Array<{
    caseName: string
    platform: string
    reportFile?: string
    summary: {
      avgMs: number
      p95Ms: number
      maxMs: number
    }
    pluginProcessSummary: {
      maxMs: number
    }
    memory?: {
      peakRssMb: number
      rssDeltaMb: number
      peakHeapUsedMb: number
    }
  }>
}

const DEFAULT_OUT_ROOT = 'e2e/reports/local-full-run'
const DEFAULT_MINI_CASES = [
  'uni-app-vite-tailwindcss-v4',
  'weapp-vite-tailwindcss-v4',
  'mpx-tailwindcss-v4',
  'taro-webpack-react-tailwindcss-v4',
  'taro-webpack-vue3-tailwindcss-v4',
]
const DEFAULT_PLATFORM_BUILD_CASES = [
  'uni-app-vite-tailwindcss-v4',
]
const DEFAULT_PLATFORM_REPORT_CASES = [
  ...DEFAULT_PLATFORM_BUILD_CASES,
  'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
  'uni-app-x-vdom-tailwindcss-v4',
]
const DEFAULT_H5_DEV_CASES = [
  'uni-app-vite-tailwindcss-v4',
]

function formatTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

function getArgValue(name: string) {
  const args = process.argv.slice(2)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function hasFlag(name: string) {
  return process.argv.slice(2).includes(name)
}

function commandText(command: string[]) {
  return command.map(part => part.includes(' ') ? JSON.stringify(part) : part).join(' ')
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const restSeconds = seconds % 60
  return minutes === 0 ? `${restSeconds}s` : `${minutes}m${String(restSeconds).padStart(2, '0')}s`
}

function formatMb(value: number) {
  return `${Math.round(value)}MB`
}

function parseListEnv(name: string) {
  return (process.env[name] ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function selectedCases(envName: string, defaultCases: string[]) {
  const explicit = parseListEnv(envName)
  return explicit.length > 0 ? explicit : defaultCases
}

function caseEnv(name: string, cases: string[]) {
  return cases.length > 0 ? { [name]: cases.join(',') } : {}
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function exactMultiplatformBuildCase(project: string, platform: string) {
  return `^${escapeRegExp(project)} ${escapeRegExp(platform)}$`
}

function buildProfileSteps(profile: string): LocalFullRunStep[] {
  const fastHmr = profile === 'smoke' || profile === 'hmr-smoke'
  const miniCases = selectedCases('LOCAL_FULL_REPORT_MINI_CASES', DEFAULT_MINI_CASES)
  const hbuilderxCases = selectedCases('LOCAL_FULL_REPORT_HBUILDERX_CASES', [
    'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
    'uni-app-x-vdom-tailwindcss-v4',
  ])
  const weappMemoryStage = profile === 'hmr-smoke' ? ['--stage', 'hmr'] : []

  const steps: LocalFullRunStep[] = [
    {
      name: 'quality',
      command: ['pnpm', 'build:ci'],
    },
    {
      name: 'mini-program-hmr-memory',
      command: ['pnpm', 'e2e:demo:weapp-memory', ...weappMemoryStage, '--out-dir', path.join('.tmp', 'local-full-report-weapp-memory')],
      env: {
        DEMO_WEAPP_MEMORY_CASE: miniCases.join(','),
        WEAPP_TW_HMR_MEMORY_DEBUG: '1',
        // 本机全端报告与 CI watch 矩阵使用同一插件处理预算，避免把平台启动/编译开销误判为产品回归。
        E2E_WATCH_MAX_PLUGIN_PROCESS_MS: process.env.E2E_WATCH_MAX_PLUGIN_PROCESS_MS ?? '6000',
        ...(fastHmr ? { E2E_WATCH_MAIN_STYLE_ONLY: '1' } : {}),
      },
      artifactFiles: [
        {
          from: path.join('.tmp', 'local-full-report-weapp-memory', 'README.md'),
          to: 'weapp-memory/README.md',
        },
        {
          from: path.join('.tmp', 'local-full-report-weapp-memory', 'summary.json'),
          to: 'weapp-memory/summary.json',
        },
      ],
      artifactGlobs: [
        {
          fromDir: path.join('.tmp', 'local-full-report-weapp-memory', 'projects'),
          pattern: /\.md$/,
          toDir: path.join('weapp-memory', 'projects'),
        },
        {
          fromDir: 'e2e/benchmark/e2e-watch-hmr',
          pattern: /^hmr-full-report-.+\.(?:json|md)$/,
          toDir: 'hmr',
        },
      ],
    },
    ...buildH5DevSteps(),
    {
      name: 'visual-weapp-h5-app',
      command: ['pnpm', 'exec', 'tsx', 'scripts/demo-visual-e2e-report.ts', '--fail-on-incomplete'],
      artifactGlobs: [
        {
          fromDir: 'e2e/.artifacts/demo-visual/full',
          pattern: /\.(?:json|md|png)$/,
          toDir: 'visual',
          recursive: true,
        },
      ],
    },
    {
      name: 'hbuilderx-android',
      command: ['pnpm', 'e2e:hbuilderx:local:android'],
      env: caseEnv('E2E_HBUILDERX_CASE', hbuilderxCases),
    },
    {
      name: 'hbuilderx-ios',
      command: ['pnpm', 'e2e:hbuilderx:local:ios'],
      env: caseEnv('E2E_HBUILDERX_CASE', hbuilderxCases),
    },
    {
      name: 'hbuilderx-harmony',
      command: ['pnpm', 'e2e:hbuilderx:local:harmony'],
      env: caseEnv('E2E_HBUILDERX_CASE', hbuilderxCases),
    },
  ]

  if (profile === 'hmr-smoke') {
    return steps.filter(step => step.name === 'mini-program-hmr-memory')
  }

  if (profile === 'smoke') {
    return [
      ...steps.filter(step => step.name === 'quality' || step.name === 'mini-program-hmr-memory'),
      ...buildPlatformBuildSteps(),
      ...steps.filter(step => step.name.startsWith('h5-dev-')),
    ]
  }
  return [
    ...steps.slice(0, 2),
    ...buildPlatformBuildSteps(),
    ...steps.slice(2),
  ]
}

function buildH5DevSteps(): LocalFullRunStep[] {
  const caseNames = selectedCases('LOCAL_FULL_REPORT_H5_CASES', DEFAULT_H5_DEV_CASES)
  const titleByName = new Map([
    ['uni-app-vite-tailwindcss-v4', 'uni-app vite Tailwind v4'],
  ])

  return caseNames.flatMap((caseName) => {
    const title = titleByName.get(caseName)
    if (!title) {
      return []
    }
    return [{
      name: `h5-dev-${caseName}`,
      command: ['pnpm', 'exec', 'vitest', 'run', '--bail=1', '-c', './e2e/vitest.e2e.config.ts', 'e2e/uni-app-vite-tailwindcss-dev-h5.test.ts', '-t', title],
      metric: {
        project: caseName,
        platform: 'h5',
        stage: 'runtime',
        source: 'uni-app-h5-dev',
      },
    }]
  })
}

function buildPlatformBuildSteps(): LocalFullRunStep[] {
  const caseNames = selectedCases('LOCAL_FULL_REPORT_PLATFORM_BUILD_CASES', DEFAULT_PLATFORM_BUILD_CASES)
  const platformFilter = parseListEnv('LOCAL_FULL_REPORT_PLATFORMS')
  const platformSet = platformFilter.length > 0 ? new Set(platformFilter) : undefined

  return DEMO_COVERAGE_MATRIX
    .filter(entry => caseNames.includes(entry.name))
    .flatMap((entry) => {
      return entry.platforms
        .filter(platform => platform.staticCoverage === 'automated')
        .filter(platform => !platformSet || platformSet.has(platform.platform))
        .map((platform): LocalFullRunStep => ({
          name: `platform-build-${entry.name}-${platform.platform.replaceAll(':', '-')}`,
          command: ['pnpm', 'e2e:multiplatform-build'],
          env: {
            E2E_MULTIPLATFORM_BUILD_CASE: exactMultiplatformBuildCase(entry.name, platform.platform),
            E2E_MULTIPLATFORM_BUILD_STATUS: 'all',
          },
          metric: {
            project: entry.name,
            platform: platform.platform,
            stage: 'build',
            source: 'multiplatform-build',
          },
        }))
    })
}

async function copyArtifact(root: string, artifact: NonNullable<LocalFullRunStep['artifactFiles']>[number]) {
  const source = path.resolve(artifact.from)
  const target = path.join(root, artifact.to)
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(source, target)
  return path.relative(process.cwd(), target)
}

async function collectArtifactEntries(sourceDir: string, recursive?: boolean) {
  const entries: string[] = []

  async function visit(dir: string, prefix = '') {
    const dirents = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const dirent of dirents) {
      const relative = path.join(prefix, dirent.name)
      if (dirent.isDirectory()) {
        if (recursive) {
          await visit(path.join(dir, dirent.name), relative)
        }
        continue
      }
      if (dirent.isFile()) {
        entries.push(relative)
      }
    }
  }

  await visit(sourceDir)
  return entries
}

async function copyArtifactGlobSince(root: string, glob: NonNullable<LocalFullRunStep['artifactGlobs']>[number], sinceMs: number) {
  const sourceDir = path.resolve(glob.fromDir)
  const entries = await collectArtifactEntries(sourceDir, glob.recursive)
  const copied: string[] = []
  for (const entry of entries.filter(name => glob.pattern.test(name)).sort()) {
    const source = path.join(sourceDir, entry)
    const sourceStat = await stat(source).catch(() => undefined)
    if (!sourceStat || sourceStat.mtimeMs < sinceMs) {
      continue
    }
    const target = path.join(root, glob.toDir, entry)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(source, target)
    copied.push(path.relative(process.cwd(), target))
  }
  return copied
}

async function runMeasuredStep(step: LocalFullRunStep, outputDir: string, preflightEnv: Record<string, string> = {}): Promise<StepReport> {
  const startedAt = new Date()
  const startedAtMs = startedAt.getTime()
  const samples: DemoE2eMemorySample[] = []
  process.stdout.write(`[local-full-report] ${step.name}: ${commandText(step.command)}\n`)

  const child = spawn(step.command[0]!, step.command.slice(1), {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(step.env ?? {}),
      ...preflightEnv,
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })

  const record = () => {
    const sample = sampleProcessTree(child.pid)
    if (sample) {
      samples.push(sample)
    }
  }
  const timer = setInterval(record, 1000)
  timer.unref?.()
  record()

  let spawnError: unknown
  const exitCode = await new Promise<number>((resolve) => {
    let settled = false
    child.on('error', (error) => {
      spawnError = error
      if (!settled) {
        settled = true
        resolve(1)
      }
    })
    child.on('close', (code) => {
      if (!settled) {
        settled = true
        resolve(code ?? 1)
      }
    })
  })
  clearInterval(timer)
  record()

  const endedAt = new Date()
  const summary = summarizeMemorySamples(samples)
  const copiedArtifacts: string[] = []
  for (const artifact of step.artifactFiles ?? []) {
    try {
      copiedArtifacts.push(await copyArtifact(outputDir, artifact))
    }
    catch (error) {
      copiedArtifacts.push(`missing:${artifact.from}`)
      process.stderr.write(`[local-full-report] artifact missing for ${step.name}: ${artifact.from}\n`)
      if (error instanceof Error) {
        process.stderr.write(`[local-full-report] ${error.message}\n`)
      }
    }
  }
  for (const glob of step.artifactGlobs ?? []) {
    copiedArtifacts.push(...await copyArtifactGlobSince(outputDir, glob, startedAtMs))
  }

  const stepReport: StepReport = {
    name: step.name,
    status: exitCode === 0 ? 'passed' : 'failed',
    command: step.command,
    ...(step.metric ? { metric: step.metric } : {}),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    exitCode,
    summary,
    copiedArtifacts,
    ...(spawnError instanceof Error ? { reason: spawnError.message } : {}),
  }

  const rawStep: DemoE2eMemoryStepReport = {
    name: step.name,
    command: step.command,
    exitCode,
    startedAt: stepReport.startedAt!,
    endedAt: stepReport.endedAt!,
    local: true,
    summary,
    samples,
  }
  const rawReport = createDemoE2eMemoryReport({
    repositoryRoot: process.cwd(),
    includeLocal: true,
    exitCode,
    steps: [rawStep],
  })
  await mkdir(path.join(outputDir, 'raw'), { recursive: true })
  await writeFile(path.join(outputDir, 'raw', `${step.name}.json`), `${JSON.stringify(rawReport, null, 2)}\n`, 'utf8')

  process.stdout.write(
    `[local-full-report] ${step.name} ${stepReport.status}: peakRSS=${summary.peakRssMb}MB rssDelta=${summary.rssDeltaMb}MB duration=${formatDuration(summary.durationMs)}\n`,
  )
  return stepReport
}

function summarizeSteps(steps: StepReport[]): LocalFullRunReport['summary'] {
  const measured = steps.filter(step => step.status !== 'skipped')
  return {
    stepCount: steps.length,
    passedStepCount: steps.filter(step => step.status === 'passed').length,
    failedStepCount: steps.filter(step => step.status === 'failed').length,
    skippedStepCount: steps.filter(step => step.status === 'skipped').length,
    peakRssMb: Math.max(0, ...measured.map(step => step.summary.peakRssMb)),
    maxRssDeltaMb: Math.max(0, ...measured.map(step => step.summary.rssDeltaMb)),
  }
}

function selectedPlatformReportEntries() {
  const caseNames = selectedCases('LOCAL_FULL_REPORT_PROJECTS', DEFAULT_PLATFORM_REPORT_CASES)
  const selected = new Set(caseNames)
  return DEMO_COVERAGE_MATRIX.filter(entry => selected.has(entry.name))
}

function normalizePlatform(platform: string) {
  if (platform === 'wx' || platform === 'weapp') {
    return 'mp-weixin'
  }
  return platform
}

function isSamePlatform(a: string, b: string) {
  return normalizePlatform(a) === normalizePlatform(b)
}

async function readJsonFile<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  }
  catch {
    return undefined
  }
}

async function readHmrFullRunReports(outputDir: string) {
  const hmrDir = path.join(outputDir, 'hmr')
  const entries = await readdir(hmrDir).catch(() => [])
  const reports: HmrFullRunSummary[] = []
  for (const entry of entries.filter(item => /^hmr-full-report-.+\.json$/.test(item)).sort()) {
    const report = await readJsonFile<HmrFullRunSummary>(path.join(hmrDir, entry))
    if (report) {
      reports.push(report)
    }
  }
  return reports
}

function createUnmeasuredMetric(coverage: DemoCoverageStatus, platform: DemoPlatformCoverage): PlatformMeasuredMetric {
  if (coverage === 'local') {
    return {
      coverage,
      status: 'local',
      reason: platform.reason ?? '该平台需要本机 SDK/IDE/设备，未在本次命令中执行。',
    }
  }
  if (coverage === 'exempt') {
    return {
      coverage,
      status: 'exempt',
      reason: platform.reason ?? '该平台在覆盖矩阵中标记为免测。',
    }
  }
  return {
    coverage,
    status: 'not-run',
    reason: '该平台属于自动化覆盖范围，但本次本机报告没有采集到对应指标。',
  }
}

function hasRuntimeHmrCommand(platform: DemoPlatformCoverage) {
  return platform.command.includes('e2e:hot-update')
    || platform.command.includes('e2e:taro:web-hmr')
    || platform.command.includes('web-vite-demo-hmr')
    || platform.command.includes('e2e:hbuilderx:local')
}

function resolveEffectiveHmrCoverage(platform: DemoPlatformCoverage): DemoCoverageStatus {
  if (platform.hmrCoverage !== 'automated' || hasRuntimeHmrCommand(platform)) {
    return platform.hmrCoverage
  }
  return 'exempt'
}

function createUnmeasuredHmrMetric(platform: DemoPlatformCoverage): PlatformMeasuredMetric {
  const coverage = resolveEffectiveHmrCoverage(platform)
  if (coverage === 'exempt' && platform.hmrCoverage === 'automated') {
    return {
      coverage,
      status: 'exempt',
      reason: '该平台当前只做构建产物验证，没有登记真实运行态 HMR 命令。',
    }
  }
  return createUnmeasuredMetric(coverage, platform)
}

function createMetricFromStep(step: StepReport, coverage: DemoCoverageStatus): PlatformMeasuredMetric {
  return {
    coverage,
    status: step.status,
    command: step.command,
    durationMs: step.summary.durationMs,
    peakRssMb: step.summary.peakRssMb,
    rssDeltaMb: step.summary.rssDeltaMb,
    source: `step:${step.name}`,
  }
}

function createMetricFromWeappStage(stage: WeappMemorySummary['cases'][number]['stages'][number], coverage: DemoCoverageStatus): PlatformMeasuredMetric {
  return {
    coverage,
    status: stage.status,
    command: stage.command,
    durationMs: stage.summary.durationMs,
    peakRssMb: stage.summary.peakRssMb,
    rssDeltaMb: stage.summary.rssDeltaMb,
    source: stage.reportFile,
    ...(stage.reason ? { reason: stage.reason } : {}),
  }
}

function createMetricFromHmrCase(hmrCase: HmrFullRunSummary['cases'][number], coverage: DemoCoverageStatus): PlatformMeasuredMetric {
  return {
    coverage,
    status: 'passed',
    e2eAvgMs: hmrCase.summary.avgMs,
    e2eP95Ms: hmrCase.summary.p95Ms,
    e2eMaxMs: hmrCase.summary.maxMs,
    pluginMaxMs: hmrCase.pluginProcessSummary.maxMs,
    peakRssMb: hmrCase.memory?.peakRssMb,
    rssDeltaMb: hmrCase.memory?.rssDeltaMb,
    pluginHeapPeakMb: hmrCase.memory?.peakHeapUsedMb,
    source: hmrCase.reportFile,
  }
}

async function buildPlatformReports(steps: StepReport[], outputDir: string): Promise<PlatformCoverageReport[]> {
  const weappMemory = await readJsonFile<WeappMemorySummary>(path.join(outputDir, 'weapp-memory', 'summary.json'))
  const hmrReports = await readHmrFullRunReports(outputDir)
  const hmrCasesByKey = new Map<string, HmrFullRunSummary['cases'][number]>()
  for (const hmrCase of hmrReports.flatMap(report => report.cases)) {
    hmrCasesByKey.set(`${hmrCase.caseName}\0${normalizePlatform(hmrCase.platform)}`, hmrCase)
  }

  return selectedPlatformReportEntries().flatMap((entry) => {
    return entry.platforms.map((platform): PlatformCoverageReport => {
      const platformBuildStep = steps.find((step) => {
        return step.metric?.stage === 'build'
          && step.metric.project === entry.name
          && step.metric.platform === platform.platform
      })
      const runtimeStep = steps.find((step) => {
        return step.metric?.stage === 'runtime'
          && step.metric.project === entry.name
          && step.metric.platform === platform.platform
      })
      const weappCase = weappMemory?.cases.find(item => item.name === entry.name && isSamePlatform(item.platform, platform.platform))
      const weappBuild = weappCase?.stages.find(stage => stage.stage === 'build' && stage.status !== 'skipped')
      const hmrCase = hmrCasesByKey.get(`${entry.name}\0${normalizePlatform(platform.platform)}`)
      const weappHmr = weappCase?.stages.find(stage => stage.stage === 'hmr' && stage.status !== 'skipped')

      return {
        project: entry.name,
        framework: entry.framework,
        builder: entry.builder,
        tailwindcss: entry.tailwindcss,
        platform: platform.platform,
        build: platformBuildStep
          ? createMetricFromStep(platformBuildStep, platform.staticCoverage)
          : weappBuild
            ? createMetricFromWeappStage(weappBuild, platform.staticCoverage)
            : createUnmeasuredMetric(platform.staticCoverage, platform),
        hmr: hmrCase
          ? createMetricFromHmrCase(hmrCase, resolveEffectiveHmrCoverage(platform))
          : weappHmr
            ? createMetricFromWeappStage(weappHmr, resolveEffectiveHmrCoverage(platform))
            : runtimeStep
              ? createMetricFromStep(runtimeStep, platform.hmrCoverage)
              : createUnmeasuredHmrMetric(platform),
      }
    })
  })
}

function formatOptionalMs(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? formatDuration(value) : '-'
}

function formatOptionalRawMs(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? formatMs(value) : '-'
}

function formatMs(value: number) {
  return `${Math.round(value)}ms`
}

function formatOptionalMb(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? formatMb(value) : '-'
}

function renderPlatformReports(platformReports: PlatformCoverageReport[]) {
  if (platformReports.length === 0) {
    return []
  }
  const lines = [
    '## 全端平台数据',
    '',
    '| project | tw | platform | build coverage | build status | build duration | build peak RSS | build RSS delta | build source/note | runtime/HMR coverage | runtime/HMR status | runtime/HMR e2e max | plugin max | runtime/HMR peak RSS | heap peak | runtime/HMR source/note |',
    '| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | --- |',
  ]
  for (const row of platformReports) {
    const buildSource = row.build.source ?? row.build.reason ?? '-'
    const hmrSource = row.hmr.source ?? row.hmr.reason ?? '-'
    lines.push([
      row.project,
      row.tailwindcss,
      row.platform,
      row.build.coverage,
      row.build.status,
      formatOptionalMs(row.build.durationMs),
      formatOptionalMb(row.build.peakRssMb),
      formatOptionalMb(row.build.rssDeltaMb),
      buildSource,
      row.hmr.coverage,
      row.hmr.status,
      formatOptionalRawMs(row.hmr.e2eMaxMs ?? row.hmr.durationMs),
      formatOptionalRawMs(row.hmr.pluginMaxMs),
      formatOptionalMb(row.hmr.peakRssMb),
      formatOptionalMb(row.hmr.pluginHeapPeakMb),
      hmrSource,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
  }
  lines.push('')
  return lines
}

function renderMarkdown(report: LocalFullRunReport) {
  const lines = [
    '# 本机全端测试报告',
    '',
    `- generated_at: ${report.generatedAt}`,
    `- repository_root: \`${report.repositoryRoot}\``,
    `- profile: ${report.profile}`,
    `- steps: ${report.summary.stepCount}`,
    `- passed: ${report.summary.passedStepCount}`,
    `- failed: ${report.summary.failedStepCount}`,
    `- skipped: ${report.summary.skippedStepCount}`,
    `- peak RSS: ${formatMb(report.summary.peakRssMb)}`,
    `- max RSS delta: ${formatMb(report.summary.maxRssDeltaMb)}`,
    '',
    '## 命令与内存',
    '',
    '| step | status | samples | peak RSS | RSS delta | max process RSS | peak processes | duration | artifacts | command |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ]

  for (const step of report.steps) {
    lines.push([
      step.name,
      step.status,
      String(step.summary.count),
      formatMb(step.summary.peakRssMb),
      formatMb(step.summary.rssDeltaMb),
      formatMb(step.summary.peakMaxProcessRssMb),
      String(step.summary.peakProcessCount),
      formatDuration(step.summary.durationMs),
      step.copiedArtifacts.map(item => `\`${item}\``).join('<br>') || '-',
      `\`${commandText(step.command)}\``,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
  }

  lines.push('', ...renderPlatformReports(report.platformReports))

  lines.push(
    '## 口径',
    '',
    '- 该报告统计本机命令进程树 RSS，不包含已在命令外常驻的 IDE/模拟器进程。',
    '- 全端平台数据来自覆盖矩阵、weapp memory summary、HMR full report 与本脚本的 per-platform build step；没有实测的 local/optional 平台会保留为 local/not-run/exempt。',
    '- `coverage-report.json` 使用 coverage-report.v3 契约记录每个 cell 的 executor、evidence schema、状态、checkout identity 和 required 未验证数量；blocked/not-run 不计为通过。',
    '- runtime/HMR 列既承载真实端到端 HMR 数据，也承载 H5 dev CSS 运行态验证数据；source/note 会标明具体来源。',
    '- HMR 细分耗时请看同目录下复制或生成的 HMR report；端到端 HMR、H5 dev 运行态耗时与插件处理耗时是不同口径。',
    '- full 模式必须先通过全部环境预检；必需平台失败立即停止，不按 optional 放行。',
    '',
  )
  return `${lines.join('\n')}\n`
}

async function writeReport(report: LocalFullRunReport, outputDir: string) {
  const platformReports = await buildPlatformReports(report.steps, outputDir)
  const nextReport: LocalFullRunReport = {
    ...report,
    platformReports,
  }
  await mkdir(outputDir, { recursive: true })
  await writeFile(path.join(outputDir, 'summary.json'), `${JSON.stringify(nextReport, null, 2)}\n`, 'utf8')
  await writeFile(path.join(outputDir, 'README.md'), renderMarkdown(nextReport), 'utf8')
  const evidence: CoverageEvidence[] = []
  for (const item of platformReports) {
    const cellId = `demo/${item.project}:${item.platform}`
    const status = (value: PlatformMeasuredMetric['status']): CoverageResultStatus => {
      if (value === 'passed') {
        return 'passed'
      }
      if (value === 'failed') {
        return 'failed'
      }
      if (value === 'not-run') {
        return 'blocked'
      }
      if (value === 'exempt') {
        return 'not-applicable'
      }
      return 'blocked'
    }
    const build = item.build
    evidence.push({
      cellId,
      layer: 'static',
      status: status(build.status),
      executor: build.source ?? 'local-full-report',
      evidenceSchema: 'demo-static-v1',
      ...(build.reason ? { reason: build.reason } : {}),
    })
    const hmr = item.hmr
    evidence.push({
      cellId,
      layer: 'hmr',
      status: status(hmr.status),
      executor: hmr.source ?? 'local-full-report',
      evidenceSchema: 'demo-hmr-v1',
      ...(hmr.reason ? { reason: hmr.reason } : {}),
    })
  }
  evidence.push(...await readCommittedCompatibilityEvidence(process.cwd()))
  const coverageReport = createCoverageReport(evidence, 'local', undefined, {
    identity: await collectCoverageIdentity(process.cwd()),
  })
  await writeFile(path.join(outputDir, 'coverage-report.json'), `${JSON.stringify(coverageReport, null, 2)}\n`, 'utf8')
}

export async function runLocalFullPlatformReport() {
  const profile = getArgValue('--profile') ?? process.env['LOCAL_FULL_REPORT_PROFILE'] ?? 'full'
  if (!['full', 'smoke', 'hmr-smoke'].includes(profile)) {
    throw new Error(`未知报告 profile：${profile}`)
  }
  const gate = profile === 'full' ? await enterFullTestGate(getArgValue('--preflight-report')) : undefined
  await runWithCleanup(async () => {
    const timestamp = getArgValue('--timestamp') ?? formatTimestamp()
    const outputRoot = getArgValue('--out-root') ?? DEFAULT_OUT_ROOT
    const outputDir = path.resolve(outputRoot, timestamp)
    const stopOnFailure = profile === 'full' || hasFlag('--fail-fast')
    const steps = buildProfileSteps(profile)
    const reports: StepReport[] = []

    await mkdir(outputDir, { recursive: true })
    for (const step of steps) {
      await gate?.check(step.name)
      const report = await runMeasuredStep(step, outputDir, gate?.env)
      reports.push(report)
      await writeReport({
        generatedAt: new Date().toISOString(),
        repositoryRoot: process.cwd(),
        profile,
        steps: reports,
        platformReports: [],
        summary: summarizeSteps(reports),
      }, outputDir)
      if (report.status === 'failed' && stopOnFailure) {
        break
      }
    }

    const report: LocalFullRunReport = {
      generatedAt: new Date().toISOString(),
      repositoryRoot: process.cwd(),
      profile,
      steps: reports,
      platformReports: [],
      summary: summarizeSteps(reports),
    }
    await writeReport(report, outputDir)

    const readme = path.join(outputDir, 'README.md')
    process.stdout.write(`[local-full-report] report written: ${path.relative(process.cwd(), readme)}\n`)

    const failedSteps = reports.filter(step => step.status === 'failed')
    if (failedSteps.length) {
      const reason = failedSteps.map(step => `${step.name} failed with exit=${step.exitCode}${step.reason ? `: ${step.reason}` : ''}`).join('; ')
      throw Object.assign(new Error(`[local-full-report] ${reason}；报告：${readme}`), { stepReports: failedSteps })
    }
  }, () => gate?.close())
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLocalFullPlatformReport().catch((error) => {
    process.stderr.write(`${formatWorkflowError(error)}\n`)
    process.exitCode = 1
  })
}
