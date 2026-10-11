import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { runFrameworkIdeProbeWithRetry } from './frameworkIdeProbeRunner'
import { getFrameworkIdeCases, getFrameworkIdeExemptCases } from './frameworkSupportMatrix'

const describeFrameworkIde = process.env['E2E_IDE'] === '1' ? describe : describe.skip
function readNumberEnv(name: string, fallback: number) {
  return Number(process.env[name] ?? fallback)
}

function getProbeTiming(entryName: string) {
  const baseTimeoutMs = readNumberEnv('E2E_AUTOMATOR_TIMEOUT_MS', 30_000)
  const timeoutMs = Math.max(
    baseTimeoutMs,
    entryName.startsWith('taro-vite-') ? readNumberEnv('E2E_IDE_TARO_VITE_TIMEOUT_MS', 60_000) : 0,
    entryName.startsWith('uni-app-vite-') ? readNumberEnv('E2E_IDE_UNI_APP_VITE_TIMEOUT_MS', 60_000) : 0,
    entryName.includes('hbuilderx') ? readNumberEnv('E2E_IDE_HBUILDERX_TIMEOUT_MS', 90_000) : 0,
  )
  const relaunchTimeoutMs = readNumberEnv('E2E_IDE_RELAUNCH_TIMEOUT_MS', 60_000)
  const closeTimeoutMs = readNumberEnv('E2E_IDE_CLOSE_TIMEOUT_MS', 5000)
  const hotUpdateTimeoutMs = process.env['E2E_IDE_HOT_UPDATE'] === '0'
    ? 0
    : readNumberEnv('E2E_IDE_HOT_UPDATE_TIMEOUT_MS', readNumberEnv('E2E_WATCH_TIMEOUT_MS', 120_000))
  const buildTimeoutMs = process.env['E2E_IDE_BUILD'] === '1'
    ? readNumberEnv('E2E_IDE_BUILD_TIMEOUT_MS', 90_000)
    : 0
  const hotUpdateTotalTimeoutMs = process.env['E2E_IDE_HOT_UPDATE'] === '0'
    ? 0
    : readNumberEnv('E2E_IDE_HOT_UPDATE_TOTAL_TIMEOUT_MS', hotUpdateTimeoutMs * 3)
  const settleTimeoutMs = readNumberEnv('E2E_IDE_SETTLE_MS', 800)
  const maxAttempts = readNumberEnv('E2E_IDE_PROBE_RETRIES', 1) + 1
  const attemptTimeoutMs = buildTimeoutMs + hotUpdateTotalTimeoutMs + timeoutMs + relaunchTimeoutMs + closeTimeoutMs + 5000
  const parentGraceMs = readNumberEnv('E2E_IDE_PARENT_TIMEOUT_GRACE_MS', 15_000)
  const testTimeoutMs = (attemptTimeoutMs + settleTimeoutMs + parentGraceMs) * maxAttempts

  return {
    attemptTimeoutMs,
    closeTimeoutMs,
    maxAttempts,
    relaunchTimeoutMs,
    settleTimeoutMs,
    testTimeoutMs,
    timeoutMs,
  }
}

describeFrameworkIde('framework support matrix ide', () => {
  it('keeps non-IDE framework cases documented as explicit exemptions', () => {
    for (const entry of getFrameworkIdeExemptCases()) {
      expect(entry.ide.reason?.length).toBeGreaterThan(0)
    }
  })

  it('covers Tailwind CSS v4 IDE hot updates for every supported framework family', () => {
    if (process.env['E2E_PROJECT_FILTER']) {
      return
    }

    const requiredFrameworks = [
      'uni-app',
      'uni-app-x',
      'taro-react',
      'taro-vue3',
      'mpx',
      'native',
    ] as const
    const ideCases = getFrameworkIdeCases()

    for (const framework of requiredFrameworks) {
      expect(
        ideCases.some(entry => entry.framework === framework && entry.tailwindcss === 'v4'),
        `${framework} should run tailwindcss@4 in e2e:ide`,
      ).toBe(true)
    }
  })

  for (const entry of getFrameworkIdeCases()) {
    const probeTiming = getProbeTiming(entry.name)
    it(`${entry.name} opens in WeChat DevTools automator and applies a visible hot update`, async () => {
      await runFrameworkIdeProbeWithRetry(entry.name, probeTiming)
    }, probeTiming.testTimeoutMs)
  }
})
