import process from 'node:process'
import { execa } from 'execa'
import { IDE_CLEANUP_FAILURE_MARKER } from './framework-ide/cleanup'
import { collectFrameworkIdeDiagnostics } from './frameworkIdeDiagnostics'

const wait = (timeout: number) => new Promise(resolve => setTimeout(resolve, timeout))
const transientIdeErrorPatterns = [
  /DevTools did not respond to protocol method/i,
  /Failed to launch wechat web devTools/i,
  /Framework IDE probe (?:launch|currentPage) timed out/i,
  /Framework IDE probe reLaunch timed out/i,
  /page ".*" is not found/i,
]

function isTransientIdeError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }
  const candidate = error as {
    message?: string
    stderr?: string
    shortMessage?: string
  }
  const text = [
    candidate.message,
    candidate.shortMessage,
    candidate.stderr,
  ].filter(Boolean).join('\n')
  return !text.includes(IDE_CLEANUP_FAILURE_MARKER) && transientIdeErrorPatterns.some(pattern => pattern.test(text))
}

async function runFrameworkIdeProbe(entryName: string, timeoutMs: number, relaunchTimeoutMs: number, testTimeoutMs: number) {
  let result
  try {
    result = await execa('node', ['--import', 'tsx', './e2e/frameworkIdeProbe.ts', entryName], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        E2E_IDE_PROBE_TIMEOUT_MS: String(timeoutMs),
        E2E_IDE_RELAUNCH_TIMEOUT_MS: String(relaunchTimeoutMs),
        E2E_IDE_BUILD: process.env['E2E_IDE_BUILD'] ?? '0',
      },
      stdio: process.env['E2E_IDE_DEBUG'] === '1' ? 'inherit' : 'pipe',
      timeout: testTimeoutMs - 1000,
      killSignal: 'SIGKILL',
      forceKillAfterDelay: 1000,
    })
  }
  catch (error) {
    if (error instanceof Error && !('stderr' in error && typeof error.stderr === 'string' && error.stderr.includes('[e2e:ide] diagnostics'))) {
      const diagnostics = await collectFrameworkIdeDiagnostics(entryName)
      error.message = `${error.message}\n${diagnostics}`
    }
    throw error
  }

  if (process.env['E2E_IDE_DEBUG'] !== '1') {
    const visibleLines = result.stdout
      ?.split(/\r?\n/)
      .filter(line => line.includes('[e2e:ide]'))
      .join('\n')
    if (visibleLines) {
      process.stdout.write(`${visibleLines}\n`)
    }
  }
}

function formatProbeFailure(error: unknown) {
  const failure = error as { shortMessage?: unknown, stdout?: unknown, stderr?: unknown } | null
  const sections = [
    `[original error]\n${error instanceof Error ? error.stack ?? error.message : String(error)}`,
  ]
  for (const field of ['shortMessage', 'stdout', 'stderr'] as const) {
    const value = failure?.[field]
    if (typeof value === 'string') {
      sections.push(`[${field}]\n${value}`)
    }
  }
  return sections.join('\n')
}

interface FrameworkIdeProbeTiming {
  attemptTimeoutMs: number
  maxAttempts: number
  relaunchTimeoutMs: number
  settleTimeoutMs: number
  timeoutMs: number
}

export async function runFrameworkIdeProbeWithRetry(entryName: string, probeTiming: FrameworkIdeProbeTiming) {
  const {
    attemptTimeoutMs,
    maxAttempts,
    relaunchTimeoutMs,
    settleTimeoutMs,
    timeoutMs,
  } = probeTiming

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await wait(settleTimeoutMs)
      await runFrameworkIdeProbe(entryName, timeoutMs, relaunchTimeoutMs, attemptTimeoutMs)
      return
    }
    catch (error) {
      if (attempt >= maxAttempts || !isTransientIdeError(error)) {
        throw error
      }
      process.stderr.write(`[e2e:ide] retry ${entryName} after transient DevTools error (${attempt}/${maxAttempts - 1})\n${formatProbeFailure(error)}\n`)
      process.stderr.write(`${await collectFrameworkIdeDiagnostics(entryName)}\n`)
    }
    finally {
      await wait(settleTimeoutMs)
    }
  }
}
