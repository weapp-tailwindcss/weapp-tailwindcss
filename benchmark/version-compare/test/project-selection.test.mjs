import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assertBenchmarkMatrixRows, selectBenchmarkProjects } from '../scripts/project-selection.mjs'
import { benchmarkProjects } from '../scripts/projects.mjs'

const taroKey = 'demo-taro-vite-react-tailwindcss-v4__mp-weixin'
const weappKey = 'demo-weapp-vite-tailwindcss-v4__mp-weixin'
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

describe('性能项目选择', () => {
  it('未指定过滤时选择完整目录，显式目录别名保留多目标语义', () => {
    expect(selectBenchmarkProjects()).toEqual(benchmarkProjects)
    expect(selectBenchmarkProjects('demo/taro-vite-react-tailwindcss-v4'))
      .toEqual(benchmarkProjects.filter(project => project.project === 'demo/taro-vite-react-tailwindcss-v4'))
  })

  it('合法 key 与目录别名混用时去重并保留登记顺序', () => {
    const selected = selectBenchmarkProjects(` ${weappKey},${taroKey},${taroKey},demo/weapp-vite-tailwindcss-v4 `)
    expect(selected.map(project => project.key)).toEqual([taroKey, weappKey])
  })

  it.each([
    'demo-taro-vite-react-tailwindcss-v4__weapp',
    'demo-weapp-vite-tailwindcss-v4__weapp',
    `${taroKey},missing-project`,
    '',
    ' , , ',
  ])('逐个拒绝未知或空选择：%s', (only) => {
    expect(() => selectBenchmarkProjects(only)).toThrow(/unknown benchmark project|at least one benchmark project/)
  })

  it.each(['run-ci.mjs', 'run-matrix.mjs'])('%s 在准备目录、读取版本和构建前拒绝错误 ID', async (script) => {
    const sandbox = await mkdtemp(path.join(os.tmpdir(), 'benchmark-selection-'))
    try {
      const sentinel = path.join(sandbox, 'not-a-directory')
      const resultDir = path.join(sandbox, 'result')
      const output = path.join(sandbox, 'matrix.json')
      await writeFile(sentinel, '原有文件不可改动')
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL(`../scripts/${script}`, import.meta.url)),
        '--only',
        'demo-weapp-vite-tailwindcss-v4__weapp',
        '--baseline-ref',
        '7d80eb1b707a4332b39bcad23e6d06cfa42bf9d5',
        '--work-root',
        sentinel,
        '--result-dir',
        resultDir,
        '--versions-file',
        path.join(sandbox, 'missing-versions.json'),
        '--out',
        output,
      ], { cwd: repoRoot, encoding: 'utf8', timeout: 5000 })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('unknown benchmark project key(s): demo-weapp-vite-tailwindcss-v4__weapp')
      expect(result.stdout).not.toContain('$ pnpm')
      await expect(stat(resultDir)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(stat(output)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await readFile(sentinel, 'utf8')).toBe('原有文件不可改动')
    }
    finally {
      await rm(sandbox, { recursive: true, force: true })
    }
  })
})

describe('性能项目与版本的行完整性', () => {
  const selected = [{ key: taroKey }, { key: weappKey }]
  const versions = [{ version: 'base' }, { version: 'current' }]
  const rows = selected.flatMap(project => versions.map(version => ({ key: project.key, version: version.version })))

  it('允许完整的两版本项目矩阵；执行错误留给原报告判定', () => {
    expect(() => assertBenchmarkMatrixRows({ rows: rows.map(row => ({ ...row, error: '保留原始失败' })) }, selected, versions)).not.toThrow()
  })

  it.each([
    { name: '缺 rows', raw: {} },
    { name: '空 rows', raw: { rows: [] } },
    { name: '只有基线', raw: { rows: rows.filter(row => row.version === 'base') } },
    { name: '只有当前版本', raw: { rows: rows.filter(row => row.version === 'current') } },
    { name: '缺一个项目', raw: { rows: rows.filter(row => row.key === taroKey) } },
    { name: '重复配对', raw: { rows: [...rows, rows[0]] } },
    { name: '仅有 core 微基准', raw: { rows: versions.map(version => ({ version: version.version, key: 'core-metric' })) } },
    { name: '旧版本替换', raw: { rows: rows.map(row => ({ ...row, version: 'old-version' })) } },
  ])('$name 不得得到成功比较', ({ raw }) => {
    expect(() => assertBenchmarkMatrixRows(raw, selected, versions)).toThrow('benchmark matrix')
  })

  it('缺少本轮选择或版本身份时拒绝', () => {
    expect(() => assertBenchmarkMatrixRows({ rows: [] }, [], versions)).toThrow('benchmark matrix')
    expect(() => assertBenchmarkMatrixRows({ rows }, selected, [versions[0]])).toThrow('benchmark matrix')
    expect(() => assertBenchmarkMatrixRows({ rows }, selected, [versions[0], versions[0]])).toThrow('benchmark matrix')
  })

  it('稀疏选择或版本身份不得生成空的预期配对', () => {
    const missingProjects = []
    missingProjects.length = 1
    const missingVersions = []
    missingVersions.length = 2
    expect(() => assertBenchmarkMatrixRows({ rows: [] }, missingProjects, versions)).toThrow('benchmark matrix')
    expect(() => assertBenchmarkMatrixRows({ rows: [] }, selected, missingVersions)).toThrow('benchmark matrix')
  })

  const measuredRows = rows.map(row => ({
    ...row,
    buildMs: [10, 11, 12],
    hmrMs: [20, 21, 22],
    summary: { build: { median: 11, p95: 12 }, hmr: { median: 21, p95: 22 } },
  }))
  const options = { buildRuns: 3, hmrRuns: 3 }

  it('主轮需要完整测量；反向确认允许零 build，但仍要求全部 HMR', () => {
    expect(() => assertBenchmarkMatrixRows({ rows: measuredRows }, selected, versions, options)).not.toThrow()
    const confirmationRows = measuredRows.map(row => ({ ...row, buildMs: [], summary: { hmr: row.summary.hmr } }))
    expect(() => assertBenchmarkMatrixRows({ rows: confirmationRows }, selected, versions, { ...options, buildRuns: 0 })).not.toThrow()
  })

  it.each([
    { name: '无构建样本', partial: { buildMs: [] } },
    { name: '缺一个 HMR 样本', partial: { hmrMs: [20, 21] } },
    { name: '非法耗时', partial: { hmrMs: [20, Number.NaN, 22] } },
    { name: '缺统计值', partial: { summary: {} } },
    { name: '无限统计值', partial: { summary: { build: { median: Number.POSITIVE_INFINITY, p95: 12 }, hmr: { median: 21, p95: 22 } } } },
  ])('$name 不得把完整配对算成已完成', ({ partial }) => {
    const incomplete = measuredRows.map((row, index) => index === 0 ? { ...row, ...partial } : row)
    expect(() => assertBenchmarkMatrixRows({ rows: incomplete }, selected, versions, options)).toThrow('benchmark matrix')
  })

  it('保留预登记不支持模式和显式执行失败，交给原报告分别判定', () => {
    const unsupported = selected.map(project => ({ ...project, buildMode: 'unsupported', hmrMode: 'unsupported' }))
    expect(() => assertBenchmarkMatrixRows({ rows }, unsupported, versions, options)).not.toThrow()
    expect(() => assertBenchmarkMatrixRows({ rows: rows.map(row => ({ ...row, error: '真实构建失败' })) }, selected, versions, options)).not.toThrow()
  })
})
