import type { HBuilderXCommandOptions } from '../../../packages/hbuilderx-runner/src/types'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runWithCleanup } from '../../../scripts/e2e-preflight/cleanup'
import { runLocalCommand } from './command'

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Playwright 发现计划含无效对象。')
  }
  return value as Record<string, unknown>
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError('Playwright 发现计划缺少有效数组。')
  }
  return value
}

/** 计入所有已展开的项目声明，保留 skip 作为容量余量，不复制测试覆盖条件。 */
export function browserBudgetFromPlan(value: unknown) {
  const plan = record(value)
  const errors = array(plan.errors)
  if (errors.length) {
    throw new Error(`Playwright 发现计划存在错误：${JSON.stringify(errors)}`)
  }
  const pending = [...array(plan.suites)]
  let declaredTestCount = 0
  while (pending.length) {
    const suite = record(pending.pop())
    for (const entry of array(suite.specs)) {
      const tests = array(record(entry).tests)
      if (!tests.length) {
        throw new Error('Playwright 发现计划含没有项目用例的 spec。')
      }
      for (const test of tests) {
        const project = record(test).projectName
        if (typeof project !== 'string' || !project.trim()) {
          throw new Error('Playwright 发现计划缺少用例所属项目。')
        }
        declaredTestCount += 1
      }
    }
    if (suite.suites !== undefined) {
      pending.push(...array(suite.suites))
    }
  }
  if (!declaredTestCount) {
    throw new Error('Playwright 发现计划为空，禁止启动浏览器验收。')
  }
  const minimumMs = 30 * 60_000
  const startupMs = 2 * 60_000
  const perTestMs = 2000
  const timeoutMs = Math.max(minimumMs, startupMs + declaredTestCount * perTestMs)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs > 2_147_483_647) {
    throw new Error('Playwright 浏览器命令预算超出有限计时器范围。')
  }
  return { declaredTestCount, minimumMs, startupMs, perTestMs, timeoutMs }
}

/** 发现也受同一取消信号和进程收尾约束，失败时不使用旧数量或默认预算兜底。 */
export async function discoverBrowserBudget(command: HBuilderXCommandOptions, signal: AbortSignal) {
  signal.throwIfAborted()
  const directory = await mkdtemp(path.join(tmpdir(), 'website-browser-plan-'))
  return await runWithCleanup(async () => {
    signal.throwIfAborted()
    const file = path.join(directory, 'plan.json')
    await runLocalCommand({
      ...command,
      args: [...command.args, '--list', '--reporter=json'],
      env: { ...command.env, PLAYWRIGHT_JSON_OUTPUT_FILE: file },
      stdio: 'pipe',
    }, signal, 20_000)
    signal.throwIfAborted()
    const budget = browserBudgetFromPlan(JSON.parse(await readFile(file, 'utf8')))
    signal.throwIfAborted()
    return budget
  }, () => rm(directory, { recursive: true, force: true }))
}
