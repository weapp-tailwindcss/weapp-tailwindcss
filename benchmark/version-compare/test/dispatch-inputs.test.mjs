import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { validateBenchmarkDispatch } from '../scripts/dispatch-inputs.mjs'

const roots = []
const uni = 'demo-uni-app-vite-tailwindcss-v4__mp-weixin'
const mpx = 'demo-mpx-tailwindcss-v4__mp-weixin'
const taro = 'demo-taro-vite-react-tailwindcss-v4__mp-weixin'

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

describe('手动诊断输入边界', () => {
  it('默认关闭诊断且空基线保持发布版语义，不访问 Git', () => {
    expect(() => validateBenchmarkDispatch({ cwd: path.join(os.tmpdir(), 'missing-benchmark-repo'), only: 'other' })).not.toThrow()
  })

  it.each(['main', 'abc123', '-'.repeat(40), 'a'.repeat(39), `${'a'.repeat(40)}\n`, '$(touch invalid)', '`invalid`'])('拒绝非完整 SHA 输入 %j', (baselineRef) => {
    expect(() => validateBenchmarkDispatch({ baselineRef })).toThrow('40 位')
  })

  it('Git 基线必须是当前仓库可读取的 commit 对象', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-dispatch-git-'))
    roots.push(root)
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    git('init', '-q')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=', 'commit', '--allow-empty', '-qm', 'fixture')
    const commit = git('rev-parse', 'HEAD')
    const tree = git('rev-parse', 'HEAD^{tree}')
    expect(() => validateBenchmarkDispatch({ cwd: root, baselineRef: commit })).not.toThrow()
    for (const mode of ['inputDiagnostics', 'allocationDiagnostics']) {
      expect(() => validateBenchmarkDispatch({ cwd: root, baselineRef: commit, only: mpx, [mode]: true })).not.toThrow()
    }
    expect(() => validateBenchmarkDispatch({ cwd: root, baselineRef: tree })).toThrow('commit 对象')
    expect(() => validateBenchmarkDispatch({ cwd: root, baselineRef: '0'.repeat(40) })).toThrow('对象不存在')
  })

  it.each([uni, mpx, taro, `${uni},${mpx}`, `${uni},${taro}`])('诊断允许显式登记的项目 %s', (only) => {
    expect(() => validateBenchmarkDispatch({ gcDiagnostics: true, only })).not.toThrow()
  })

  it.each(['', 'unknown', 'toString', 'demo-taro-webpack-tailwindcss-v4__mp-weixin', `${uni},unknown`])('诊断拒绝缺失或不支持的项目 %j', (only) => {
    expect(() => validateBenchmarkDispatch({ gcDiagnostics: true, only })).toThrow('显式选择')
  })

  it('输入证据和分配采样互斥，不能省略完整 Git 基线或改变固定轮次', () => {
    expect(() => validateBenchmarkDispatch({ inputDiagnostics: true, allocationDiagnostics: true })).toThrow('分开')
    expect(() => validateBenchmarkDispatch({ inputDiagnostics: true, only: uni })).toThrow('完整 Git')
    expect(() => validateBenchmarkDispatch({ allocationDiagnostics: true, baselineRef: 'a'.repeat(40), only: uni, hmrRuns: 5 })).toThrow('固定')
    expect(() => validateBenchmarkDispatch({ allocationDiagnostics: true, baselineRef: 'a'.repeat(40), only: `${uni},${mpx}` })).toThrow('固定')
  })
})

describe('Benchmark 工作流诊断装配', () => {
  it('显式诊断包含 skipped job 也使用独立 check 名和并发组，不能覆盖正式验收', async () => {
    const workflow = parse(await fs.readFile(new URL('../../../.github/workflows/benchmark.yml', import.meta.url), 'utf8'))
    const formalNames = {
      'scope': 'scope',
      'weekly-demo-cost': 'weekly-demo-cost',
      'synthetic-performance': 'Synthetic Performance Gate (ubuntu-latest, 22)',
      'benchmark-matrix': 'Prepare benchmark matrix',
      'benchmark-shard': 'Benchmark shard (uni)',
      'current-vs-published': 'Performance guard and published trend',
    }
    const render = (value, event, inputs) => value.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, expression) => runInNewContext(`(${expression})`, {
      github: { event_name: event, run_id: 123, event: { pull_request: { number: 1316 } }, ref: 'refs/heads/fixture' },
      inputs,
      matrix: { case_name: 'uni' },
      format: (template, argument) => template.replace('{0}', argument),
    }, { timeout: 100 }))
    expect(Object.keys(workflow.jobs).sort()).toEqual([...Object.keys(formalNames), 'source-diagnostics'].sort())
    for (const [id, name] of Object.entries(formalNames)) {
      expect(render(workflow.jobs[id].name, 'pull_request', {})).toBe(name)
      expect(render(workflow.jobs[id].name, 'workflow_dispatch', {})).toBe(name)
      for (const flag of ['gc_diagnostics', 'input_diagnostics', 'allocation_diagnostics']) {
        const diagnosticName = render(workflow.jobs[id].name, 'workflow_dispatch', { [flag]: true })
        expect(diagnosticName).toMatch(/diagnostic/i)
        expect(Object.values(formalNames)).not.toContain(diagnosticName)
        expect(diagnosticName).not.toBe('Benchmark Quality Gate')
        expect(render(workflow.jobs[id].name, 'pull_request', { [flag]: true })).toBe(name)
      }
    }
    expect(render(workflow.concurrency.group, 'pull_request', {})).toBe('benchmark-1316')
    expect(render(workflow.concurrency.group, 'workflow_dispatch', { input_diagnostics: true })).toBe('benchmark-diagnostic-123')
    expect(render(workflow.concurrency.group, 'workflow_dispatch', { allocation_diagnostics: true })).toBe('benchmark-diagnostic-123')
    expect(render(workflow.concurrency.group, 'workflow_dispatch', { gc_diagnostics: true })).toBe('benchmark-diagnostic-123')
  })

  it('只在显式诊断 dispatch 为 Uni/Taro 启用 preload 和固定 Node，正式 PR 保持原策略', async () => {
    const workflow = parse(await fs.readFile(new URL('../../../.github/workflows/benchmark.yml', import.meta.url), 'utf8'))
    expect(workflow.on.workflow_dispatch.inputs.gc_diagnostics).toMatchObject({ type: 'boolean', default: false })
    expect(workflow.on.workflow_dispatch.inputs.input_diagnostics).toMatchObject({ type: 'boolean', default: false })
    expect(workflow.on.workflow_dispatch.inputs.allocation_diagnostics).toMatchObject({ type: 'boolean', default: false })
    expect(workflow.on.workflow_dispatch.inputs.baseline_ref.default).toBe('')
    const matrixSteps = workflow.jobs['benchmark-matrix'].steps
    expect(matrixSteps[0].with['fetch-depth']).toBe(0)
    const validation = matrixSteps.find(step => step.name === 'Validate dispatch diagnostic inputs')
    expect(validation).toMatchObject({
      if: 'github.event_name == \'workflow_dispatch\'',
      env: { BENCH_DISPATCH_BASELINE_REF: `\${{ inputs.baseline_ref }}` },
      run: 'node benchmark/version-compare/scripts/dispatch-inputs.mjs',
    })
    const shard = workflow.jobs['benchmark-shard']
    const node = shard.steps.find(step => step.uses === 'actions/setup-node@v6').with['node-version']
    // 仅求值仓库中的布尔表达式；外部输入始终作为变量传入，不拼接进代码。
    const evaluate = (expression, event, inputs, project) => runInNewContext(`(${expression.slice(3, -2)})`, { github: { event_name: event }, inputs, matrix: { bench_only: project } }, { timeout: 100 })
    const inputs = { baseline_ref: 'a'.repeat(40), gc_diagnostics: true }
    for (const event of ['pull_request', 'push']) {
      expect(evaluate(shard.env.WEAPP_TW_BENCH_GC_DIAGNOSTICS, event, inputs, uni)).toBe('0')
      expect(evaluate(shard.env.WEAPP_TW_BENCH_GC_DIAGNOSTICS, event, inputs, taro)).toBe('0')
      expect(evaluate(shard.env.WEAPP_TW_BENCH_GC_DIAGNOSTICS, event, inputs, mpx)).toBe('1')
      expect(evaluate(shard.env.WEAPP_TW_BENCH_BASE_REF, event, inputs, uni)).toBe('')
      expect(evaluate(node, event, inputs, uni)).toBe('22')
    }
    expect(evaluate(shard.env.WEAPP_TW_BENCH_GC_DIAGNOSTICS, 'workflow_dispatch', inputs, uni)).toBe('1')
    expect(evaluate(shard.env.WEAPP_TW_BENCH_GC_DIAGNOSTICS, 'workflow_dispatch', inputs, taro)).toBe('1')
    expect(evaluate(shard.env.WEAPP_TW_BENCH_GC_DIAGNOSTICS, 'workflow_dispatch', { gc_diagnostics: false }, taro)).toBe('0')
    expect(evaluate(shard.env.WEAPP_TW_BENCH_BASE_REF, 'workflow_dispatch', inputs, uni)).toBe(inputs.baseline_ref)
    expect(evaluate(node, 'workflow_dispatch', inputs, uni)).toBe('22.23.4')
    expect(evaluate(shard.env.WEAPP_TW_BENCH_BASE_REF, 'workflow_dispatch', { baseline_ref: '' }, uni)).toBe('')
    expect(evaluate(shard.env.WEAPP_TW_BENCH_GC_DIAGNOSTICS, 'workflow_dispatch', { gc_diagnostics: false }, uni)).toBe('0')
    for (const flag of ['input_diagnostics', 'allocation_diagnostics']) {
      expect(evaluate(node, 'workflow_dispatch', { [flag]: true }, uni)).toBe('22.23.4')
      expect(evaluate(node, 'pull_request', { [flag]: true }, uni)).toBe('22')
    }
    expect(evaluate(shard.env.BENCH_ALLOCATION_DIAGNOSTICS, 'workflow_dispatch', { gc_diagnostics: true }, uni)).toBe('false')
    expect(evaluate(shard.env.BENCH_ALLOCATION_DIAGNOSTICS, 'workflow_dispatch', { allocation_diagnostics: true }, uni)).toBe('true')
    expect(evaluate(shard.env.BENCH_INPUT_DIAGNOSTICS, 'pull_request', { input_diagnostics: true }, uni)).toBe('false')
    expect(shard.steps.find(step => step.name === 'Run pull request performance guard').run).toContain('pnpm perf:guard')
    expect(shard.steps.find(step => step.name === 'Run current vs published benchmark').run).not.toMatch(/allow-regressions|skip-memory-confirmation/)
  })
})
