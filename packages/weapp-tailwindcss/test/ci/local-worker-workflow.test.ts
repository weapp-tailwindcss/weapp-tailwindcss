/* eslint-disable no-template-curly-in-string -- 按字面量验证 GitHub 工作流表达式。 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { resolveScopes } from '../../../../scripts/ci/resolve-pr-scope.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const workflow = parse(readFileSync(join(root, '.github', 'workflows', 'pr-gate.yml'), 'utf8'))
const job = workflow.jobs['windows-utilities']
const steps = job.steps as Array<Record<string, any>>
const run = steps.find(step => step.name === 'Verify local command lifecycle on this OS')!
const files = [
  'launch-gate.test.ts',
  'launch-gate-options.test.ts',
  'process-lifecycle.test.ts',
  'windows-lifecycle.test.ts',
  'command.test.ts',
  'server.test.ts',
  'test-scope.test.ts',
  'test-process-state.test.ts',
]

describe('本地命令生命周期的真实跨平台 CI 门禁', () => {
  it('复用已安装依赖与本平台构建，Windows Node 22/24 和两个 POSIX 平台均执行完整定向集合', () => {
    expect(job.strategy.matrix.include).toEqual(expect.arrayContaining([
      { os: 'windows-latest', node: 22 },
      { os: 'windows-latest', node: 24 },
      { os: 'ubuntu-latest', node: 24 },
      { os: 'macos-latest', node: 24 },
    ]))
    expect(job.strategy['fail-fast']).toBe(false)
    expect(steps.filter(step => step.uses === './.github/actions/setup-pnpm')).toHaveLength(1)
    expect(steps.filter(step => step.run?.includes('run build'))).toHaveLength(1)
    expect(steps.indexOf(run)).toBeGreaterThan(steps.findIndex(step => step.run?.includes('run build')))
    expect(run.if).toBeUndefined()
    expect(run.run).toContain('pnpm --filter @weapp-tailwindcss/website exec vitest run')
    expect([...run.run.matchAll(/scripts\/local-worker\/([\w-]+\.test\.ts)/g)].map(match => match[1])).toEqual(files)
    expect(run.run).toContain('--maxWorkers=1')
    expect(run.run).toContain('--update=none')
    expect(run.run).not.toMatch(/--(?:exclude|testNamePattern|passWithNoTests|retry|shard|testTimeout)|\|\|\s*true/)
    expect(job['continue-on-error']).toBeUndefined()
    expect(run['continue-on-error']).toBeUndefined()
  })

  it('tee 不吞掉失败退出码，始终保留每个系统与 Node 版本的失败日志', () => {
    expect(run.shell).toBe('bash')
    expect(run.run).toContain('set -o pipefail')
    expect(run.run).toContain('mkdir -p .tmp/local-worker-ci')
    expect(run.run).toContain('2>&1 | tee .tmp/local-worker-ci/run.log')
    expect(run.run).toContain('--reporter=default --reporter=json --outputFile.json=../.tmp/local-worker-ci/vitest.json')
    const upload = steps.find(step => step.name === 'Upload local command lifecycle diagnostics')!
    expect(upload).toMatchObject({
      if: 'always()',
      uses: 'actions/upload-artifact@v7',
      with: {
        'name': 'local-command-lifecycle-${{ matrix.os }}-node${{ matrix.node }}',
        'path': '.tmp/local-worker-ci/**',
        'include-hidden-files': true,
        'if-no-files-found': 'warn',
        'retention-days': 14,
        'overwrite': true,
      },
    })
    expect(steps.indexOf(upload)).toBeGreaterThan(steps.indexOf(run))
  })

  it('网站代码与工作流变更不会跳过矩阵，失败会阻断必需 PR Gate', () => {
    for (const file of [
      ...files.map(file => `website/scripts/local-worker/${file}`),
      'website/scripts/local-worker/launch-gate.ts',
      'website/scripts/local-worker/launch-gate-path.cjs',
      'website/scripts/local-worker/launch-gate-preload.cjs',
      'website\\scripts\\local-worker\\lifecycle.ts',
      '.github/workflows/pr-gate.yml',
    ]) {
      expect(resolveScopes([file]).core, file).toBe(true)
    }
    expect(workflow.on.pull_request.paths).toBeUndefined()
    expect(workflow.on.pull_request['paths-ignore']).toBeUndefined()
    expect(job.if).toBe('needs.scope.outputs.core == \'true\'')
    const gate = workflow.jobs['pr-gate']
    expect(gate.needs).toContain('windows-utilities')
    expect(gate.if).toBe('always() && !cancelled()')
    expect(gate.steps[0].env.UTILITIES_RESULT).toBe('${{ needs.windows-utilities.result }}')
    expect(gate.steps[0].run).toContain('"$UTILITIES_RESULT"; do\n    test "$result" = success')
  })
})
