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

it.each(['lynx-native', 'react-native-compatibility', 'tailwind-capabilities'])('%s 直接监听共享 catalog，而非依赖其它文件顺便触发', async (name) => {
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
