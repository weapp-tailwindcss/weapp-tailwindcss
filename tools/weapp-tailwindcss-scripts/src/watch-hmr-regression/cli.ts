import type { CliOptions, MiniProgramScope } from './types'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { DEFAULT_PLUGIN_PROCESS_BUDGET_MS } from './types'

function parseArg(flag: string, argv: string[]) {
  const index = argv.indexOf(flag)
  if (index === -1) {
    return undefined
  }
  return argv[index + 1]
}

function parseFirstArg(flags: string[], argv: string[]) {
  for (const flag of flags) {
    const value = parseArg(flag, argv)
    if (value != null) {
      return value
    }
  }
  return undefined
}

function parseNumber(value: string | undefined, fallback: number) {
  if (value == null) {
    return fallback
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function parseOptionalNumber(value: string | undefined) {
  if (value == null || value.trim() === '') {
    return undefined
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function parseBooleanFlag(flag: string, argv: string[]) {
  return argv.includes(flag)
}

function parseBooleanEnv(name: string) {
  const value = process.env[name]
  return value === '1' || value === 'true'
}

function parseMiniProgramScope(value: string | undefined): MiniProgramScope | undefined {
  if (value == null || value.trim() === '') {
    return undefined
  }
  if (value === 'main-package' || value === 'subpackages') {
    return value
  }
  throw new Error(`invalid mini-program scope: ${value}`)
}

export function resolveOptions(): CliOptions {
  const argv = process.argv.slice(2)
  const miniProgramScope = parseMiniProgramScope(
    parseArg('--mini-program-scope', argv) ?? process.env['E2E_WATCH_MINI_PROGRAM_SCOPE'],
  )
  const mainStyleSubPackageLimit = parseOptionalNumber(parseArg('--main-style-subpackage-limit', argv))
    ?? parseOptionalNumber(process.env['E2E_WATCH_MAIN_STYLE_SUBPACKAGE_LIMIT'])
  const reportFile = parseFirstArg(['--report', '--report-file'], argv)
  const maxHotUpdateMs = parseOptionalNumber(parseArg('--max-hot-update-ms', argv))
    ?? parseOptionalNumber(process.env['E2E_WATCH_MAX_HOT_UPDATE_MS'])
  const maxMemoryRssMb = parseOptionalNumber(parseArg('--max-memory-rss-mb', argv))
    ?? parseOptionalNumber(process.env['E2E_WATCH_MAX_MEMORY_RSS_MB'])
  const maxMemoryRssDeltaMb = parseOptionalNumber(parseArg('--max-memory-rss-delta-mb', argv))
    ?? parseOptionalNumber(process.env['E2E_WATCH_MAX_MEMORY_RSS_DELTA_MB'])
  const maxMemoryHeapUsedMb = parseOptionalNumber(parseArg('--max-memory-heap-used-mb', argv))
    ?? parseOptionalNumber(process.env['E2E_WATCH_MAX_MEMORY_HEAP_USED_MB'])
  return {
    caseName: (parseArg('--case', argv) ?? 'all') as CliOptions['caseName'],
    timeoutMs: parseNumber(parseArg('--timeout', argv), 240000),
    pollMs: parseNumber(parseArg('--poll', argv), 40),
    skipBuild: parseBooleanFlag('--skip-build', argv),
    quietSass: parseBooleanFlag('--quiet-sass', argv),
    webOnly: parseBooleanFlag('--web-only', argv),
    miniProgramOnly: parseBooleanFlag('--mini-program-only', argv)
      || parseBooleanEnv('E2E_WATCH_MINI_PROGRAM_ONLY')
      || miniProgramScope != null,
    ...(miniProgramScope !== undefined ? { miniProgramScope } : {}),
    styleOnly: parseBooleanFlag('--style-only', argv),
    mainStyleOnly: parseBooleanFlag('--main-style-only', argv),
    ...(mainStyleSubPackageLimit !== undefined ? { mainStyleSubPackageLimit } : {}),
    ...(reportFile !== undefined ? { reportFile } : {}),
    ...(maxHotUpdateMs !== undefined ? { maxHotUpdateMs } : {}),
    maxPluginProcessMs: parseOptionalNumber(parseArg('--max-plugin-process-ms', argv))
      ?? parseOptionalNumber(process.env['E2E_WATCH_MAX_PLUGIN_PROCESS_MS'])
      ?? DEFAULT_PLUGIN_PROCESS_BUDGET_MS,
    ...(maxMemoryRssMb !== undefined ? { maxMemoryRssMb } : {}),
    ...(maxMemoryRssDeltaMb !== undefined ? { maxMemoryRssDeltaMb } : {}),
    ...(maxMemoryHeapUsedMb !== undefined ? { maxMemoryHeapUsedMb } : {}),
  }
}

export function resolvePnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

export function formatPath(file: string) {
  return path.relative(process.cwd(), file) || '.'
}

function findWorkspaceRoot(start: string) {
  let current = start
  while (true) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      return start
    }
    current = parent
  }
}

export function resolveBaseCwd() {
  const initialCwd = process.env['INIT_CWD']
  const start = initialCwd
    ? path.resolve(initialCwd)
    : process.cwd()
  return findWorkspaceRoot(start)
}
