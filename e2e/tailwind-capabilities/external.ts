import type { RunContext } from './context'
import type { ExecutionTarget } from './plan'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { formatWorkflowError, runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { createPnpmCommand } from '../../scripts/pnpm-command.mjs'
import { EnvironmentBlockedError, findEnvironmentBlock } from './environment-block'
import { assertCapabilitySuccess } from './report'
import { createStageBinding, processEnvironmentFailure, readStageReceipt, stageBindingVariable } from './stage-receipt'

async function preserveEnvironmentFailure(error: unknown, source: string, context: RunContext): Promise<never> {
  return runWithCleanup(() => Promise.reject(error), async () => {
    let archiveError: unknown
    try {
    // 故障目录只供诊断，不进入能力报告或通过率；其中可能包含未完成的报告。
      await cp(source, path.join(context.directory, 'blocked-native-diagnostics'), { recursive: true })
    }
    catch (failure) { archiveError = String(failure) }
    await writeFile(path.join(context.directory, 'environment-block.json'), `${JSON.stringify({ runId: context.runId, status: 'blocked', reason: formatWorkflowError(error), archiveError }, null, 2)}\n`)
  })
}

export async function runPnpmStage(context: RunContext, args: string[], name: string, env: NodeJS.ProcessEnv = {}) {
  await mkdir(context.directory, { recursive: true })
  const invocation = createPnpmCommand(args)
  let output = ''
  const log = path.join(context.directory, `${name}.log`)
  const binding = createStageBinding(context, name)
  return runWithCleanup(async () => {
    try {
      const child = execa(invocation.command, invocation.args, { cwd: context.root, shell: invocation.shell, env: { ...process.env, ...context.env, ...env, TAILWIND_E2E_RUN_ID: context.runId, [stageBindingVariable]: binding ? JSON.stringify(binding) : '' }, reject: false, timeout: 1_800_000, all: true })
      child.all?.on('data', (data) => {
        output += data.toString()
        process.stdout.write(data)
      })
      const result = await child
      const processFailure = processEnvironmentFailure(result)
      if (processFailure) {
        throw new EnvironmentBlockedError(`${name} 环境故障：${processFailure}；${log}`)
      }
      const receiptStatus = binding ? await readStageReceipt(binding) : undefined
      if (result.exitCode !== 0 || receiptStatus === 'failed') {
        throw new Error(`${name} 执行失败 (${result.exitCode})；${log}`)
      }
    }
    catch (error) {
      output += `\n${formatWorkflowError(error)}\n`
      const reason = processEnvironmentFailure(error)
      if (reason && !(error instanceof EnvironmentBlockedError)) {
        throw new EnvironmentBlockedError(`${name} 环境故障：${reason}；${log}`, { cause: error })
      }
      throw error
    }
  }, async () => {
    await writeFile(log, output || '进程无输出\n')
  })
}

export async function runExternalTarget(target: ExecutionTarget, context: RunContext) {
  if (target === 'mini-builds') {
    return runPnpmStage(context, ['exec', 'vitest', 'run', '-c', 'e2e/tailwind-capabilities/build-matrix/vitest.config.ts', '--update=none'], target, { TAILWIND_E2E_MATRIX_DIRECTORY: context.directory, E2E_MULTIPLATFORM_BUILD_STATUS: 'all', ...(context.caseFilter ? { E2E_MULTIPLATFORM_BUILD_CASE: context.caseFilter.source } : {}) })
  }
  if (target === 'framework-regressions') {
    return runPnpmStage(context, ['e2e:frameworks:mp'], target)
  }
  let executionError: unknown
  let raw: any
  const archived = path.join(context.directory, 'native')
  if (target.startsWith('expo-') || target.startsWith('react-native-')) {
    const engine = target.startsWith('expo-') ? target.slice('expo-'.length) : undefined
    const platform = engine ? 'web' : target.slice('react-native-'.length) as 'android' | 'ios'
    const destination = path.join(context.root, 'e2e', '.artifacts', engine ? `react-native-web-${engine}` : `react-native-${platform}`)
    try {
      await runPnpmStage(context, [`e2e:react-native:${platform}`], target, engine ? { RN_WEB_BROWSER: engine } : {})
    }
    catch (error) {
      if (findEnvironmentBlock(error)) {
        return preserveEnvironmentFailure(error, destination, context)
      }
      executionError = error
    }
    try {
      const observed = JSON.parse(await readFile(path.join(destination, 'report.json'), 'utf8'))
      if (observed.runId !== context.runId) {
        throw new Error(`${target} 报告不属于本轮 ${context.runId}`)
      }
      await cp(destination, archived, { recursive: true })
      raw = JSON.parse(await readFile(path.join(archived, 'report.json'), 'utf8'))
      if (engine && raw.environment.browser?.name !== engine) {
        throw new Error(`${target} 浏览器证据不匹配`)
      }
    }
    catch (error) { executionError = executionError ? new AggregateError([executionError, error], '子进程与本轮证据读取同时失败') : error }
    const { buildNativeCapabilityReport } = await import('./native-adapter')
    const result = await buildNativeCapabilityReport(context, target as `expo-${'chromium' | 'firefox' | 'webkit'}` | `react-native-${'android' | 'ios'}`, raw, executionError)
    assertCapabilitySuccess(result.report)
  }
  else if (target.startsWith('lynx-')) {
    const platform = target.slice('lynx-'.length) as 'android' | 'ios'
    try {
      await runPnpmStage(context, ['exec', 'tsx', 'e2e/lynx/run-native.ts', platform, '--output', archived], target)
    }
    catch (error) {
      if (findEnvironmentBlock(error)) {
        return preserveEnvironmentFailure(error, archived, context)
      }
      executionError = error
    }
    try {
      const binding = JSON.parse(await readFile(path.join(archived, 'run-context.json'), 'utf8'))
      if (binding.runId !== context.runId) {
        throw new Error(`${target} 缺少本轮原生证据`)
      }
      raw = JSON.parse(await readFile(path.join(archived, 'report.json'), 'utf8'))
    }
    catch (error) { executionError = executionError ? new AggregateError([executionError, error], '子进程与本轮证据读取同时失败') : error }
    const { buildLynxCapabilityReport } = await import('./lynx-adapter')
    const result = await buildLynxCapabilityReport(context, target as `lynx-${'android' | 'ios'}`, raw, executionError)
    assertCapabilitySuccess(result.report)
  }
  else {
    throw new Error(`未登记的外部目标 ${target}`)
  }
  if (executionError) {
    throw executionError
  }
}
