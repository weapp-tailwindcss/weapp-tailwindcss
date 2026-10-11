import process from 'node:process'
import { execa } from 'execa'

export type RunnerHealthMode = 'hosted' | 'local'

export interface RunnerHealthResult {
  mode: RunnerHealthMode
  platform?: string
  checks: Array<{ name: string, passed: boolean, detail: string }>
}

export function requiredTools(mode: RunnerHealthMode, platform = '') {
  const tools = ['node', 'pnpm', 'git']
  if (mode === 'local') {
    if (platform === 'android' || platform === 'harmony') {
      tools.push(platform === 'android' ? 'adb' : 'hdc')
    }
    if (platform === 'ios') {
      tools.push('xcrun')
    }
  }
  return tools
}

async function checkTool(name: string) {
  try {
    const result = await execa(name, ['--version'])
    return { name, passed: true, detail: result.stdout.trim().split(/\r?\n/)[0] ?? 'ok' }
  }
  catch (error) {
    return { name, passed: false, detail: error instanceof Error ? error.message : String(error) }
  }
}

export async function checkRunnerHealth(mode: RunnerHealthMode, platform = ''): Promise<RunnerHealthResult> {
  const checks = await Promise.all(requiredTools(mode, platform).map(checkTool))
  if (mode === 'local') {
    const deviceCheck = platform === 'android'
      ? await checkTool('adb')
      : platform === 'ios'
        ? await checkTool('xcrun')
        : platform === 'harmony'
          ? await checkTool('hdc')
          : undefined
    if (deviceCheck && !checks.some(item => item.name === deviceCheck.name)) {
      checks.push(deviceCheck)
    }
  }
  return { mode, ...(platform ? { platform } : {}), checks }
}

async function main() {
  const mode = (process.argv.find(item => item.startsWith('--mode='))?.slice('--mode='.length) ?? 'hosted') as RunnerHealthMode
  const platform = process.argv.find(item => item.startsWith('--platform='))?.slice('--platform='.length) ?? ''
  if (mode !== 'hosted' && mode !== 'local') {
    throw new Error(`invalid runner health mode: ${mode}`)
  }
  const result = await checkRunnerHealth(mode, platform)
  for (const check of result.checks) {
    process.stdout.write(`[runner-health] ${check.passed ? 'pass' : 'fail'} ${check.name}: ${check.detail}\n`)
  }
  if (result.checks.some(check => !check.passed)) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
