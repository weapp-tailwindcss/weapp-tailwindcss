/* eslint-disable no-template-curly-in-string -- 按字面量核验工作流表达式。 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import semver from 'semver'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const workflow = parse(readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8'))

describe('CI 安装资源策略', () => {
  it('全部 CI job 复用安装 guard，预算不会扩散到构建和测试环境', () => {
    for (const job of Object.values(workflow.jobs) as any[]) {
      expect(job.env?.NODE_OPTIONS).toBeUndefined()
      for (const step of job.steps ?? []) {
        if (step.name === 'Install dependencies') {
          expect(step.run).toBe('node scripts/ci/install-workspace.mjs')
        }
        expect(step.run ?? '').not.toMatch(/GITHUB_ENV.*NODE_OPTIONS|NODE_OPTIONS.*GITHUB_ENV/)
      }
    }
  })

  it('保留 pnpm 11 / Node 22 兼容矩阵和包管理器身份', () => {
    const job = workflow.jobs.compatibility
    const matrix = job.strategy.matrix.include
    expect(matrix).toContain('macos-node22-core')
    expect(matrix).toContain('11.9.0')
    expect(matrix).toContain('"node-version":22')
    expect(job.steps.find((step: any) => step.uses?.startsWith('pnpm/action-setup@')).with)
      .toMatchObject({ version: '${{ matrix.pnpm-version }}', package_json_file: '.github/pnpm-action-package.json' })
    const regression = job.steps.find((step: any) => step.name === 'Run core compatibility regression tests').run
    expect(regression).toContain('test/ci/install-frozen-config.test.ts')
    expect(regression).toContain('test/ci/install-workspace.test.ts')
  })

  it('安装 Node 满足开发引擎，切换后的运行时满足公开包与 pnpm 11 范围', () => {
    const rootManifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
    const publicManifest = JSON.parse(readFileSync(path.join(root, 'packages', 'weapp-tailwindcss', 'package.json'), 'utf8'))
    const job = workflow.jobs.compatibility
    const setup = job.steps.find((step: any) => step.uses?.startsWith('actions/setup-node@'))
    const selection = setup.with['node-version']
    const matrices = job.strategy.matrix.include.match(/\[\{.*?\}\]/g)
    expect(matrices).toHaveLength(2)
    for (const matrix of matrices) {
      for (const entry of JSON.parse(matrix)) {
        // 仅求值仓库中的选择表达式；矩阵数据作为变量传入，适配 GitHub 带连字符的属性名。
        const development = String(runInNewContext(`(${selection.slice(3, -2).replaceAll('matrix.node-version', 'matrix["node-version"]')})`, { matrix: entry }, { timeout: 100 }))
        const runtime = String(entry['node-version'])
        for (const [node, engine] of [[development, rootManifest.engines.node], [development, '>=22.13.0'], [runtime, publicManifest.engines.node], [runtime, '>=22.13.0']]) {
          // major selector 刷新到该主版本最新版本，不表示 x.0.0；准确版本按实际 semver 核验。
          expect(semver.valid(node) ? semver.satisfies(node, engine) : semver.intersects(node, engine), entry.scenario).toBe(true)
        }
      }
    }
  })

  it('先安装构建并验证 hooks，再切换最低运行时执行公开包回归', () => {
    const steps = workflow.jobs.compatibility.steps
    const names = ['Setup Node.js environment', 'Install dependencies', 'Build core package dependency closure', 'Verify Git hooks on this platform', 'Switch to the minimum supported runtime', 'Verify core escape on this platform', 'Run core compatibility regression tests']
    const indices = names.map(name => steps.findIndex((step: any) => step.name === name))
    expect(indices.every(index => index >= 0)).toBe(true)
    expect([...indices].sort((left, right) => left - right)).toEqual(indices)
  })
})
