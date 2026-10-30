import fs from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { parse } from 'yaml'

const workflowFile = new URL('../../../.github/workflows/benchmark.yml', import.meta.url)
function evaluate(expression, event, inputs = {}) {
  return runInNewContext(`(${expression})`, {
    github: { event_name: event, run_id: 101, event: { pull_request: { number: 1323 } }, ref: 'refs/heads/diagnostic' },
    inputs,
    matrix: { case_name: 'fixture' },
    format: (template, argument) => template.replace('{0}', argument),
  }, { timeout: 100 })
}
const render = (value, event, inputs) => value.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, expression) => evaluate(expression, event, inputs))

it('源码诊断只在显式 dispatch 运行，与正式 check、并发组和预算隔离', async () => {
  const workflow = parse(await fs.readFile(workflowFile, 'utf8'))
  const job = workflow.jobs['source-diagnostics']
  for (const event of ['pull_request', 'push']) {
    expect(Boolean(evaluate(job.if, event, { source_diagnostics: 'runtime' }))).toBe(false)
    expect(Boolean(evaluate(workflow.jobs.scope.if, event, { source_diagnostics: 'runtime' }))).toBe(true)
  }
  for (const source_diagnostics of [undefined, 'none']) {
    expect(Boolean(evaluate(job.if, 'workflow_dispatch', { source_diagnostics }))).toBe(false)
    expect(Boolean(evaluate(workflow.jobs.scope.if, 'workflow_dispatch', { source_diagnostics }))).toBe(true)
  }
  for (const source_diagnostics of ['watch', 'taro', 'runtime']) {
    const inputs = { source_diagnostics }
    expect(Boolean(evaluate(job.if, 'workflow_dispatch', inputs))).toBe(true)
    expect(Boolean(evaluate(workflow.jobs.scope.if, 'workflow_dispatch', inputs))).toBe(false)
    expect(render(workflow.concurrency.group, 'workflow_dispatch', inputs)).toBe('benchmark-diagnostic-101')
    for (const id of ['scope', 'synthetic-performance', 'benchmark-matrix', 'benchmark-shard', 'current-vs-published']) {
      expect(render(workflow.jobs[id].name, 'workflow_dispatch', inputs)).toMatch(/diagnostic/i)
    }
  }
  expect(job['continue-on-error']).toBeUndefined()
  expect(job.steps.map(step => step.run ?? '').join('\n')).not.toMatch(/perf:guard|allow-regressions|skip-memory-confirmation/)
})

it('固定 driver 与 Node，两侧版本通过数据输入，准备失败也保留可上传证据', async () => {
  const workflow = parse(await fs.readFile(workflowFile, 'utf8'))
  const job = workflow.jobs['source-diagnostics']
  expect(job.steps[0].with).toMatchObject({ 'ref': `\${{ github.sha }}`, 'fetch-depth': 0 })
  const initialization = job.steps.findIndex(step => step.name === 'Initialize failure evidence')
  const install = job.steps.findIndex(step => step.name === 'Install driver dependencies')
  expect(initialization).toBeGreaterThan(0)
  expect(initialization).toBeLessThan(install)
  expect(job.steps.find(step => step.uses === 'actions/setup-node@v6').with).toMatchObject({ 'node-version': '22.23.4', 'check-latest': false })
  expect(job.steps.find(step => step.name === 'Validate source diagnostic fixtures').run).toContain('benchmark/version-compare/test/source-diagnostics-attributes.test.mjs')
  expect(job.env).toMatchObject({
    SOURCE_DIAGNOSTIC_BASE: `\${{ inputs.baseline_ref }}`,
    SOURCE_DIAGNOSTIC_CURRENT: `\${{ inputs.current_ref }}`,
    SOURCE_DIAGNOSTIC_DRIVER: `\${{ github.sha }}`,
  })
  const upload = job.steps.find(step => step.uses === 'actions/upload-artifact@v7')
  expect(upload).toMatchObject({ if: 'always()', with: { 'path': '.tmp/source-diagnostics/**', 'if-no-files-found': 'error' } })
  expect(upload['continue-on-error']).toBeUndefined()
})
