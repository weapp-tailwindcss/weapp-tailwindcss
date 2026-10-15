import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import routes from '../../routes.json'
import { localBrowserCommand } from '../browser-local'
import { browserBudgetFromPlan, discoverBrowserBudget } from './browser-budget'

function spec(...projects: string[]) {
  return { tests: projects.map(projectName => ({ projectName })) }
}

it('递归计入嵌套 suite 的每个项目声明，skip 也保留在容量中', () => {
  const plan = {
    errors: [],
    suites: [{
      specs: [spec('chromium', 'firefox', 'webkit')],
      suites: [{ specs: [{ tests: [{ projectName: 'chromium', expectedStatus: 'skipped' }] }], suites: [{ specs: [spec('webkit')] }] }],
    }],
  }
  expect(browserBudgetFromPlan(plan)).toMatchObject({ declaredTestCount: 5, timeoutMs: 1_800_000 })
})

it('计划增长超过默认容量时扩大整体预算，保留启动余量和有限上界', () => {
  const plan = (count: number) => ({ errors: [], suites: [{ specs: Array.from({ length: count }, () => spec('chromium', 'firefox', 'webkit')) }] })
  const before = browserBudgetFromPlan(plan(300))
  const after = browserBudgetFromPlan(plan(800))
  expect(before.timeoutMs).toBe(1_920_000)
  expect(after.timeoutMs).toBe(4_920_000)
  expect(after.timeoutMs).toBeGreaterThan(before.timeoutMs)
  expect(after.timeoutMs).toBeLessThanOrEqual(2_147_483_647)
})

it('超过 Node 有限计时器上界时拒绝启动，不让计时器溢出为立即超时', () => {
  const suite = { specs: [{ tests: Array.from({ length: 1000 }, () => ({ projectName: 'chromium' })) }] }
  expect(() => browserBudgetFromPlan({ errors: [], suites: Array.from({ length: 1100 }).fill(suite) })).toThrow('有限计时器范围')
})

it.each([
  null,
  [],
  {},
  { errors: {}, suites: [] },
  { errors: [{ message: '读取配置失败' }], suites: [] },
  { errors: [], suites: [] },
  { errors: [], suites: [null] },
  { errors: [], suites: [{ specs: [null] }] },
  { errors: [], suites: [{ specs: [{ tests: [] }] }] },
  { errors: [], suites: [{ specs: [{ tests: [{ projectName: '' }] }] }] },
  { errors: [], suites: [{ specs: [], suites: {} }] },
])('无效或空计划不能获得执行预算 (%j)', (plan) => {
  expect(() => browserBudgetFromPlan(plan)).toThrow()
})

it('真实 Playwright CLI 的三项目计划可直接消费，不启动浏览器', async () => {
  const controller = new AbortController()
  const command = localBrowserCommand({
    websiteRoot: fileURLToPath(new URL('../..', import.meta.url)),
    baseUrl: new URL('http://127.0.0.1:45678/'),
    signal: controller.signal,
    request: async () => { throw new Error('发现不应访问页面') },
  })
  const budget = await discoverBrowserBudget(command, controller.signal)
  expect(budget.declaredTestCount).toBeGreaterThan(routes.length * 2 * 3)
  expect(budget.declaredTestCount % 3).toBe(0)
  expect(budget.timeoutMs).toBeGreaterThan(30 * 60_000)
}, 25_000)

it('真实发现子进程失败时保留首次 stderr，不用无效计划错误覆盖', async () => {
  await expect(discoverBrowserBudget({
    command: process.execPath,
    args: ['-e', 'process.stderr.write("首个发现错误\\n"); setTimeout(() => process.exit(7), 300)', '--'],
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
  }, new AbortController().signal)).rejects.toThrow('首个发现错误')
})
