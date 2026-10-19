import type { RunContext } from './context'
import type { ExecutionTarget } from './plan'
import type { CapabilityReport } from './types'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { enterFullTestGate } from '../../scripts/e2e-preflight/gate'
import { targetContext } from './context'
import { classifyTargetFailure, recordPreflightRejection, writeExecutionRecord } from './execution-record'
import { runExternalTarget, runPnpmStage } from './external'
import { parseOptions, stageName } from './plan'
import { assertCapabilitySuccess } from './report'
import { scheduleTargets } from './scheduler'
import { browserEngines } from './types'

async function execute(target: ExecutionTarget, context: RunContext) {
  const selected = targetContext(context, target)
  await mkdir(selected.directory, { recursive: true })
  if (target === 'static') {
    const { fixtureBaseline } = await import('./baseline')
    await fixtureBaseline(context.root)
    const { runStatic } = await import('./static')
    return assertCapabilitySuccess(await runStatic(selected))
  }
  if (target === 'authoring') {
    const { runAuthoring } = await import('./authoring')
    return assertCapabilitySuccess(await runAuthoring(selected))
  }
  if (target.startsWith('web-')) {
    const { runWebSuite } = await import('./web-suite')
    const engine = browserEngines.find(item => target === `web-${item}`)!
    return runWebSuite(selected, engine)
  }
  if (target === 'weapp') {
    return runPnpmStage(selected, ['exec', 'tsx', 'e2e/tailwind-capabilities/weapp-cli.ts', selected.directory, selected.runId, ...(selected.caseFilter ? [selected.caseFilter.source, selected.caseFilter.flags] : [])], 'weapp')
  }
  return runExternalTarget(target, selected)
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  if (options.list) {
    process.stdout.write(`${options.targets.join('\n')}\n`)
    return
  }
  const root = path.resolve(import.meta.dirname, '../..')
  const runId = randomUUID()
  const directory = path.join(root, 'e2e', '.artifacts', 'tailwind', runId)
  const metadata = { runId, preflight: options.preflightReport, filter: options.caseFilter?.source }
  const gate = await enterFullTestGate(options.preflightReport, root, true).catch(async (error) => {
    await recordPreflightRejection(directory, metadata, options.targets, error)
    process.stderr.write(`[tailwind] 预检拒绝，全部目标未尝试；报告：${directory}\n`)
    throw error
  })
  const context: RunContext = { root, directory, runId, env: { ...process.env, ...gate.env, TAILWIND_E2E_RUN_ID: runId, CI: '1' }, ...(options.caseFilter ? { caseFilter: options.caseFilter } : {}) }
  const stages: Array<{ target: string, status: string, attempted: boolean, reason?: string }> = options.targets.map(target => ({ target, status: 'not-run', attempted: false }))
  try {
    await mkdir(context.directory, { recursive: true })
    await gate.check('weapp web React Native android ios Lynx android ios')
    await runPnpmStage(context, ['turbo', 'run', 'build', '--filter=weapp-tailwindcss...', '--filter=@weapp-tailwindcss/react-native...', '--filter=@weapp-tailwindcss/lynx...'], 'build')
    await scheduleTargets(stages, {
      check: target => gate.check(stageName(target)),
      execute: async (target) => {
        process.stdout.write(`[tailwind] ${target}\n`)
        return execute(target, context)
      },
      persist: () => writeExecutionRecord(context.directory, metadata, stages),
      classify: async (target) => {
        const base = path.join(context.directory, target)
        const files = target.startsWith('web-') ? [path.join(base, 'report.json'), path.join(base, 'registry', 'report.json'), path.join(base, 'hmr', 'report.json'), path.join(base, 'authoring', 'report.json'), path.join(base, 'context', 'report.json'), path.join(base, 'framework-source', 'report.json')] : [path.join(base, 'report.json')]
        const loaded = await Promise.allSettled(files.map(async file => JSON.parse(await readFile(file, 'utf8')) as CapabilityReport))
        const reports = loaded.flatMap(item => item.status === 'fulfilled' ? [item.value] : [])
        if (!reports.length) {
          throw new Error('目标未产生能力报告')
        }
        const results = reports.flatMap(report => report.results)
        return classifyTargetFailure(results)
      },
    })
    if (stages.some(item => item.status !== 'passed')) {
      throw new Error(`本轮含失败或未执行目标；报告 ${context.directory}`)
    }
  }
  catch (error) {
    for (const pending of stages.filter(item => !item.attempted)) {
      pending.status = 'blocked'
      pending.reason = String(error)
    }
    throw error
  }
  finally {
    await runWithCleanup(async () => {
      await writeExecutionRecord(context.directory, metadata, stages)
    }, () => gate.close())
  }
  process.stdout.write(`[tailwind] 报告：${context.directory}\n`)
}

await main()
