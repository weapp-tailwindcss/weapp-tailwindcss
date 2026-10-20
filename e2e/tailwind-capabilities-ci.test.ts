import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import YAML from 'yaml'
import { resolveScopes } from '../scripts/ci/resolve-pr-scope.mjs'

it.each(['tools/tailwindcss-test-catalog/src/index.ts', 'tools\\tailwindcss-test-catalog\\src\\index.ts', 'e2e/tailwind-capabilities/report.ts'])('共享目录变更同时启用两条原生门禁及能力门禁：%s', (file) => {
  const scopes = resolveScopes([file])
  expect(scopes.core).toBe(true)
  expect(scopes.lynx).toBe(true)
  expect(scopes['react-native']).toBe(true)
  expect(scopes['tailwind-capabilities']).toBe(true)
})

it.each(['lynx-native', 'react-native-compatibility'])('%s 直接监听共享 catalog，而非依赖其它文件顺便触发', async (name) => {
  const workflow = YAML.parse(await readFile(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8'))
  expect(workflow.on.pull_request.paths).toContain('tools/tailwindcss-test-catalog/**')
  expect(workflow.on.pull_request.paths).toContain('e2e/tailwind-capabilities/**')
})

it('普通 Web CI 为三个浏览器独立执行、失败即失败并保存诊断', async () => {
  const workflow = YAML.parse(await readFile(new URL('../.github/workflows/tailwind-capabilities.yml', import.meta.url), 'utf8'))
  const web = workflow.jobs.web
  expect(web.strategy.matrix.engine).toEqual(['chromium', 'firefox', 'webkit'])
  expect(web.strategy['fail-fast']).toBe(false)
  expect(web.steps.some((step: { run?: string }) => /pnpm e2e:tailwind:web:ci --engine \$\{\{ matrix\.engine \}\}/.test(step.run ?? ''))).toBe(true)
  expect(web.steps.some((step: { run?: string }) => /playwright install --with-deps \$\{\{ matrix\.engine \}\}/.test(step.run ?? ''))).toBe(true)
  expect(web.steps.every((step: Record<string, unknown>) => !step['continue-on-error'])).toBe(true)
  const upload = web.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/upload-artifact@'))
  expect(upload.if).toBe('always()')
  expect(upload.with.name).toContain('matrix.engine')
})

it('三浏览器只通过 PR 汇总调用一次，并且失败不能被 required gate 放行', async () => {
  const workflow = YAML.parse(await readFile(new URL('../.github/workflows/pr-gate.yml', import.meta.url), 'utf8'))
  const capabilities = YAML.parse(await readFile(new URL('../.github/workflows/tailwind-capabilities.yml', import.meta.url), 'utf8'))
  expect(capabilities.on).not.toHaveProperty('pull_request')
  expect(capabilities.on).toHaveProperty('workflow_call')
  const job = workflow.jobs['tailwind-capabilities']
  expect(job.needs).toBe('scope')
  expect(job.if).toBe('needs.scope.outputs.core == \'true\'')
  expect(job.uses).toBe('./.github/workflows/tailwind-capabilities.yml')
  expect(job.with.full_verification).toContain('inputs.full_verification')
  const gate = workflow.jobs['pr-gate']
  expect(gate.needs).toContain('tailwind-capabilities')
  const require = gate.steps.find((step: { env?: Record<string, string> }) => step.env?.TAILWIND_RESULT)
  expect(require.env.TAILWIND_RESULT).toMatch(/^\$\{\{ needs\.tailwind-capabilities\.result \}\}$/)
  expect(require.run).toContain('test "$TAILWIND_RESULT" = success')
})

it('审批后的版本 PR 通过完整 PR checks 等待同一三浏览器门禁', async () => {
  const workflow = YAML.parse(await readFile(new URL('../.github/workflows/version-pr-ci.yml', import.meta.url), 'utf8'))
  expect(workflow.jobs.approve.environment.name).toBe('version-pr-ci')
  expect(workflow.jobs['pr-checks']).toMatchObject({
    needs: 'approve',
    uses: './.github/workflows/pr-gate.yml',
    with: { full_verification: true },
  })
  expect(workflow.jobs['pr-gate'].needs).toContain('pr-checks')
  expect(workflow.jobs['pr-gate'].steps[0].run).toContain('job.result !== "success"')
})
