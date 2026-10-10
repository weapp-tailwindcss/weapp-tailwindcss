/* eslint-disable no-template-curly-in-string -- 按字面量核验工作流表达式。 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
  })

  it('兼容矩阵的准确 Node 基线同时满足仓库与 pnpm 11 引擎范围', () => {
    const rootManifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
    const matrices = workflow.jobs.compatibility.strategy.matrix.include.match(/\[\{.*?\}\]/g)
    expect(matrices).toHaveLength(2)
    for (const matrix of matrices) {
      for (const entry of JSON.parse(matrix)) {
        const node = String(entry['node-version'])
        if (node.includes('.')) {
          expect(semver.satisfies(node, rootManifest.engines.node), entry.scenario).toBe(true)
          expect(semver.satisfies(node, '>=22.13.0'), entry.scenario).toBe(true)
        }
        else {
          // setup-node 的 major selector 解析该主版本最新版本，不表示 x.0.0。
          expect(semver.intersects(node, rootManifest.engines.node), entry.scenario).toBe(true)
          expect(semver.intersects(node, '>=22.13.0'), entry.scenario).toBe(true)
        }
      }
    }
  })
})
