import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { DEFAULT_PLUGIN_PROCESS_BUDGET_MS } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { HOT_UPDATE_CASES_BY_TARGET, HOT_UPDATE_CI_CASES, resolveHotUpdateTargets } from './e2eMatrix'
import { writeHmrFullRunMarkdown, writeHmrFullRunReport } from './hmrReport'

function toNumberEnv(name: string, fallback: number) {
  const value = process.env[name]
  if (!value) {
    return fallback
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function toBoolEnv(name: string, fallback: boolean) {
  const value = process.env[name]
  if (value == null) {
    return fallback
  }
  return value === '1' || value === 'true'
}

function resolveOptionalNumberEnv(name: string) {
  const value = process.env[name]
  if (value == null || value.trim() === '') {
    return undefined
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function formatTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) {
    return `${seconds}s`
  }
  return `${minutes}m${String(seconds).padStart(2, '0')}s`
}

function formatProgress(completed: number, total: number) {
  const safeTotal = Math.max(total, 1)
  const width = 20
  const ratio = Math.min(Math.max(completed / safeTotal, 0), 1)
  const filled = Math.round(width * ratio)
  const percent = Math.round(ratio * 100)
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${completed}/${total} ${percent}%`
}

interface ProgressState {
  current: number
  startedAt: number
  total: number
}

function resolveCiCaseNames() {
  if (process.env.E2E_HOT_UPDATE_CI !== '1') {
    return undefined
  }

  const rawCaseNames = process.env.HOT_UPDATE_CI_CASES
  if (rawCaseNames) {
    return new Set(rawCaseNames.split(',').map(item => item.trim()).filter(Boolean))
  }

  return new Set<string>(HOT_UPDATE_CI_CASES)
}

async function ensureReportDir(root: string) {
  const dir = path.resolve(root, 'e2e/benchmark/e2e-watch-hmr')
  await mkdir(dir, { recursive: true })
  return dir
}

export interface WatchHmrCommandOptions {
  timeoutMs: number
  pollMs: number
  maxPluginProcessMs: number
  reportFile: string
  webOnly: boolean
  styleOnly: boolean
  mainStyleOnly: boolean
  skipBuild: boolean
  mainStyleSubPackageLimit?: string
  maxHotUpdateMs?: number
  maxMemoryRssMb?: number
  maxMemoryRssDeltaMb?: number
  maxMemoryHeapUsedMb?: number
}

export function resolveWatchCommandOptions(reportFile: string): WatchHmrCommandOptions {
  return {
    timeoutMs: toNumberEnv('E2E_WATCH_TIMEOUT_MS', 240000),
    pollMs: toNumberEnv('E2E_WATCH_POLL_MS', 40),
    maxPluginProcessMs: toNumberEnv('E2E_WATCH_MAX_PLUGIN_PROCESS_MS', DEFAULT_PLUGIN_PROCESS_BUDGET_MS),
    reportFile,
    webOnly: toBoolEnv('E2E_WATCH_WEB_ONLY', false),
    styleOnly: toBoolEnv('E2E_WATCH_STYLE_ONLY', false),
    mainStyleOnly: toBoolEnv('E2E_WATCH_MAIN_STYLE_ONLY', false),
    skipBuild: toBoolEnv('E2E_WATCH_SKIP_BUILD', true),
    mainStyleSubPackageLimit: process.env.E2E_WATCH_MAIN_STYLE_SUBPACKAGE_LIMIT,
    maxHotUpdateMs: resolveOptionalNumberEnv('E2E_WATCH_MAX_HOT_UPDATE_MS'),
    maxMemoryRssMb: resolveOptionalNumberEnv('E2E_WATCH_MAX_MEMORY_RSS_MB'),
    maxMemoryRssDeltaMb: resolveOptionalNumberEnv('E2E_WATCH_MAX_MEMORY_RSS_DELTA_MB'),
    maxMemoryHeapUsedMb: resolveOptionalNumberEnv('E2E_WATCH_MAX_MEMORY_HEAP_USED_MB'),
  }
}

export function buildWatchHmrArgs(caseName: string, options: WatchHmrCommandOptions) {
  return [
    '--filter',
    'weapp-tailwindcss',
    'test:watch-hmr',
    '--',
    '--case',
    caseName,
    '--timeout',
    String(options.timeoutMs),
    '--poll',
    String(options.pollMs),
    '--max-plugin-process-ms',
    String(options.maxPluginProcessMs),
    '--report',
    options.reportFile,
    ...(options.skipBuild ? ['--skip-build'] : []),
    '--quiet-sass',
    ...(options.webOnly ? ['--web-only'] : []),
    ...(options.styleOnly ? ['--style-only'] : []),
    ...(options.mainStyleOnly ? ['--main-style-only'] : []),
    ...(options.mainStyleSubPackageLimit ? ['--main-style-subpackage-limit', options.mainStyleSubPackageLimit] : []),
    ...(options.maxHotUpdateMs != null ? ['--max-hot-update-ms', String(options.maxHotUpdateMs)] : []),
    ...(options.maxMemoryRssMb != null && options.maxMemoryRssMb > 0 ? ['--max-memory-rss-mb', String(options.maxMemoryRssMb)] : []),
    ...(options.maxMemoryRssDeltaMb != null && options.maxMemoryRssDeltaMb > 0 ? ['--max-memory-rss-delta-mb', String(options.maxMemoryRssDeltaMb)] : []),
    ...(options.maxMemoryHeapUsedMb != null && options.maxMemoryHeapUsedMb > 0 ? ['--max-memory-heap-used-mb', String(options.maxMemoryHeapUsedMb)] : []),
  ]
}

function killSpawnedProcess(child: ReturnType<typeof spawn>) {
  if (child.pid == null || child.exitCode != null) {
    return
  }

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    }).on('error', () => undefined)
    return
  }

  child.kill('SIGTERM')
}

async function runConcreteCase(root: string, caseName: string, progress: ProgressState) {
  const reportDir = await ensureReportDir(root)
  const reportFile = path.join(reportDir, `${formatTimestamp()}-${caseName}.json`)
  const commandOptions = resolveWatchCommandOptions(reportFile)
  const commandTimeoutMs = toNumberEnv('E2E_WATCH_COMMAND_TIMEOUT_MS', 0)
  const elapsed = () => formatDuration(Date.now() - progress.startedAt)

  process.stdout.write(
    `[e2e-hot-update] ${formatProgress(progress.current - 1, progress.total)} start ${caseName} remaining=${progress.total - progress.current + 1} elapsed=${elapsed()}\n`,
  )

  const child = spawn(
    'pnpm',
    buildWatchHmrArgs(caseName, commandOptions),
    {
      cwd: root,
      env: {
        ...process.env,
        WEAPP_TW_HMR_MEMORY_DEBUG: process.env.WEAPP_TW_HMR_MEMORY_DEBUG ?? '1',
      },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  )

  const exitCode = await new Promise<number>((resolve, reject) => {
    let settled = false
    let timeout: NodeJS.Timeout | undefined
    const settle = (code: number) => {
      if (settled) {
        return
      }
      settled = true
      if (timeout) {
        clearTimeout(timeout)
      }
      resolve(code)
    }
    timeout = commandTimeoutMs > 0
      ? setTimeout(() => {
          process.stderr.write(
            `[e2e-hot-update] ${formatProgress(progress.current - 1, progress.total)} command timeout ${caseName} after ${formatDuration(commandTimeoutMs)} elapsed=${elapsed()}\n`,
          )
          killSpawnedProcess(child)
          settle(124)
        }, commandTimeoutMs)
      : undefined
    timeout?.unref?.()
    child.on('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      if (timeout) {
        clearTimeout(timeout)
      }
      reject(error)
    })
    child.on('close', (code) => {
      settle(code ?? 1)
    })
  })

  if (exitCode !== 0) {
    process.stderr.write(
      `[e2e-hot-update] ${formatProgress(progress.current - 1, progress.total)} failed ${caseName} remaining=${progress.total - progress.current + 1} elapsed=${elapsed()}\n`,
    )
    throw new Error(`[e2e-hot-update] case failed: ${caseName} (exit=${exitCode})`)
  }

  process.stdout.write(
    `[e2e-hot-update] ${formatProgress(progress.current, progress.total)} passed ${caseName} remaining=${progress.total - progress.current} elapsed=${elapsed()} -> ${reportFile}\n`,
  )

  return reportFile
}

async function main() {
  const root = path.resolve(import.meta.dirname, '..')
  const targets = resolveHotUpdateTargets()
  const onlyCaseName = process.env.E2E_HOT_UPDATE_CASE_NAME
  const ciCaseNames = resolveCiCaseNames()
  const startedAt = Date.now()
  const runnableTargets = targets
    .map(target => ({
      ...target,
      caseNames: HOT_UPDATE_CASES_BY_TARGET[target.name]
        .filter(caseName => !onlyCaseName || caseName === onlyCaseName)
        .filter(caseName => !ciCaseNames || ciCaseNames.has(caseName)),
    }))
    .filter(target => target.caseNames.length > 0)
  const totalCases = runnableTargets.reduce((total, target) => total + target.caseNames.length, 0)
  let completedCases = 0
  const reports: Array<{ caseName: string, reportFile: string }> = []

  process.stdout.write(`[e2e-hot-update] ${formatProgress(0, totalCases)} total=${totalCases}\n`)

  for (const target of runnableTargets) {
    process.stdout.write(`[e2e-hot-update] target ${target.name}: ${target.caseNames.join(', ')}\n`)
    for (const caseName of target.caseNames) {
      const reportFile = await runConcreteCase(root, caseName, {
        current: completedCases + 1,
        startedAt,
        total: totalCases,
      })
      reports.push({ caseName, reportFile })
      completedCases += 1
    }
  }

  if (reports.length > 0) {
    const reportDir = await ensureReportDir(root)
    const fullRunReportFile = path.join(reportDir, `hmr-full-report-${formatTimestamp(new Date(startedAt))}.json`)
    const fullRunReport = await writeHmrFullRunReport({
      generatedAt: new Date(startedAt).toISOString(),
      repositoryRoot: root,
      targetNames: runnableTargets.map(target => target.name),
      reports,
      outputFile: fullRunReportFile,
    })
    const fullRunMarkdownFile = fullRunReportFile.replace(/\.json$/, '.md')
    await writeHmrFullRunMarkdown({
      report: fullRunReport,
      outputFile: fullRunMarkdownFile,
    })
    process.stdout.write(`[e2e-hot-update] hmr full report saved: ${fullRunReportFile}\n`)
    process.stdout.write(`[e2e-hot-update] hmr full markdown saved: ${fullRunMarkdownFile}\n`)
  }

  process.stdout.write(`[e2e-hot-update] ${formatProgress(completedCases, totalCases)} all cases passed elapsed=${formatDuration(Date.now() - startedAt)}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`)
    process.exitCode = 1
  })
}
