import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { assertRegistryGraph, pruneLock } from '../lock.mjs'
import { createManifest, planJobs } from '../manifest.mjs'
import { treeRss } from '../memory.mjs'
import { defaults, modes, rowKey, schema, summarizeRow, validateReport } from '../model.mjs'
import { assertPublished, parseLock } from '../published.mjs'
import { renderHtml, renderMarkdown } from '../report.mjs'
import { mergeReports } from '../runner.mjs'
import { downloadFootprint } from '../install.mjs'
import { createBudgets, evaluateBudgets } from '../gate.mjs'
import { sourceFiles } from '../precompile.mjs'
import { seedPreparationStore } from '../fixtures.mjs'

const directories = []
it('下载体积按已完成包去重，缺少大小不能记作零字节', () => {
  const events = [
    { name: 'pnpm:fetching-progress', status: 'started', packageId: 'a@1', size: 3730 },
    { name: 'pnpm:fetching-progress', status: 'started', packageId: 'a@1', size: 3730 },
    { name: 'pnpm:progress', status: 'fetched', packageId: 'a@1' },
  ]
  const encode = () => events.map(value => JSON.stringify(value)).join('\n')
  expect(downloadFootprint(encode()).packageArchiveBytes).toBe(3730)
  events.push({ name: 'pnpm:progress', status: 'fetched', packageId: 'missing@1' })
  expect(downloadFootprint(encode()).packageArchiveBytes).toBeNull()
})
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })
async function temp() { const dir = await mkdtemp(path.join(os.tmpdir(), 'cost-test-')); directories.push(dir); return dir }
it('不计时准备的缓存副本相互隔离，拒绝嵌套与同一目录', async () => {
  const root = await temp()
  const enabled = path.join(root, 'enabled-store')
  const native = path.join(root, 'native-store')
  await mkdir(enabled)
  await writeFile(path.join(enabled, 'package'), 'registry content')
  await seedPreparationStore(enabled, native)
  await writeFile(path.join(native, 'package'), 'modified')
  expect(await readFile(path.join(enabled, 'package'), 'utf8')).toBe('registry content')
  await expect(seedPreparationStore(enabled, enabled)).rejects.toThrow('独立目录')
  await expect(seedPreparationStore(enabled, path.join(enabled, 'nested'))).rejects.toThrow('独立目录')
})
it('静态准备不得把捕获构建产生的缓存当作源码重放', async () => {
  const project = await temp()
  for (const directory of ['src', '.temp', '.cache', 'dist', 'unpackage']) {
    await mkdir(path.join(project, directory))
    await writeFile(path.join(project, directory, 'page.js'), 'export const className = "h-8"')
  }
  for (const extension of ['ts', 'mts', 'mjs']) {
    await writeFile(path.join(project, `gulpfile.${extension}`), 'export const tasks = []')
  }
  expect(await sourceFiles({ project })).toEqual(['src/page.js'])
})
function example() {
  const row = { demo: 'demo', target: 'web', os: 'ubuntu-latest', node: 24, metric: 'build.cold', version: '1.2.3', semanticVerified: true, status: 'passed', samples: Object.fromEntries(modes.map(mode => [mode, Array.from({ length: 7 }, () => ({ ms: mode === 'enabled' ? 80 : 100, peakRssMb: 20, semanticHash: 'stable' }))])) }
  row.dependencies = { comparisonIdentity: { nativeLock: 'native', staticLock: 'static', scenario: 'fixture' } }
  return { schema, sha: 'abc', runId: '1.1', package: { version: '1.2.3', integrity: 'sha512-test' }, environment: { platform: 'linux', node: 'v24', pnpm: '12', cpu: 'test' }, settings: defaults, boundaries: [], expected: [rowKey(row)], rows: [row] }
}

it('预算需要两批独立且同类环境，时间与 RSS 均受门禁', () => {
  const first = { ...example(), environment: { platform: 'linux', node: 'v24', cpu: 'test', pnpm: '12' } }
  const second = structuredClone(first)
  expect(() => createBudgets(first, second)).toThrow('独立采样')
  second.runId = '2.1'
  const budget = createBudgets(first, second)
  const unchanged = JSON.stringify(budget)
  const after = structuredClone(first)
  for (const sample of after.rows[0].samples.enabled) { sample.ms += 20; sample.peakRssMb += 65 }
  const errors = evaluateBudgets(after, budget)
  expect(errors.some(error => error.includes('ms.enabled'))).toBe(true)
  expect(errors.some(error => error.includes('peakRssMb.enabled'))).toBe(true)
  expect(JSON.stringify(budget)).toBe(unchanged)
  after.rows[0].dependencies.comparisonIdentity.nativeLock = 'changed framework'
  expect(evaluateBudgets(after, budget)[0]).toContain('依赖或场景不兼容')
  after.environment.cpu = 'different runner'
  expect(evaluateBudgets(after, budget)[0]).toContain('环境不兼容')
})

it('只遍历依赖值，不把 any-link 包名误认为链接', () => {
  const lock = { importers: { '.': { dependencies: { 'any-link': { version: '1.0.0' } } } }, packages: { 'any-link@1.0.0': { resolution: { integrity: 'sha512-x' } } }, snapshots: {} }
  expect(() => assertRegistryGraph(lock)).not.toThrow()
  lock.importers['.'].dependencies['any-link'].version = 'link:../local'
  expect(() => assertRegistryGraph(lock)).toThrow('本地协议')
})
it('裁剪不可达依赖，并保留可选依赖、别名和循环', () => {
  const importer = { dependencies: { a: { version: '1.0.0(peer@2)' } } }
  const lock = { packages: Object.fromEntries(['a@1.0.0', '@scope/b@2.0.0', 'unused@3'].map(key => [key, {}])), snapshots: { 'a@1.0.0(peer@2)': { optionalDependencies: { alias: '@scope/b@2.0.0' } }, '@scope/b@2.0.0': { dependencies: { a: '1.0.0(peer@2)' } }, 'unused@3': {} } }
  expect(Object.keys(pruneLock(lock, importer).packages)).toEqual(['a@1.0.0', '@scope/b@2.0.0'])
})
it('pnpm 12 多文档锁文件使用项目图，坏文档不能跳过', () => {
  expect(parseLock('importers: {}\npackages: {}\nsnapshots: {}\n---\nimporters: {project: {}}\npackages: {}\nsnapshots: {}').importers).toHaveProperty('project')
  expect(() => parseLock('importers: [\n---\nimporters: {}\npackages: {}\nsnapshots: {}')).toThrow()
})
it('安装按 demo、系统和 Node 去重，并覆盖全 CLI 清单', () => {
  const jobs = planJobs()
  const builds = jobs.flatMap(job => job.rows.filter(row => row.metric === 'build.cold').map(row => `${row.demo}:${row.target}`))
  expect(new Set(builds).size).toBe(107)
  const installs = jobs.flatMap(job => job.rows.filter(row => row.metric === 'install.cold').map(rowKey))
  expect(new Set(installs).size).toBe(installs.length)
  expect(installs.length).toBeLessThan(builds.length)
})
it('计划失败仍保留完整预期清单和下载报告，不解析替代版本', async () => {
  const manifest = await createManifest({ only: 'gulp-tailwindcss-v4:weapp', failure: new Error('npm registry timeout') })
  expect(manifest.planFailed).toBe(true)
  expect(manifest.package.version).toBeNull()
  expect(manifest.jobs).toEqual(planJobs('gulp-tailwindcss-v4:weapp'))
  const report = await mergeReports(manifest, [])
  expect(report.rows).toHaveLength(manifest.expected.length)
  expect(report.rows.every(row => row.status === 'missing')).toBe(true)
  expect(renderMarkdown(report)).toContain('npm registry timeout')
  expect(renderHtml(report)).toContain('npm registry timeout')
  expect(validateReport(report).length).toBeGreaterThan(0)
})
it('缺少样本、重复、版本错误、语义失败都会拒绝完整报告', () => {
  expect(validateReport(example())).toEqual([])
  for (const mutation of [r => r.rows.push(r.rows[0]), r => r.rows[0].samples.static.pop(), r => r.rows[0].version = '9.0.0', r => r.rows[0].semanticVerified = false, r => r.rows = []]) {
    const report = example(); mutation(report); expect(validateReport(report).length).toBeGreaterThan(0)
  }
  const shortened = example()
  shortened.settings = { ...defaults, runs: 1 }
  for (const samples of Object.values(shortened.rows[0].samples)) samples.splice(1)
  expect(validateReport(shortened)).toContain('正式报告采样口径不足')
})
it('报告保留改善、零基线与 HTML 注入边界', () => {
  const report = example()
  expect(renderMarkdown(report)).toContain('-20.00 ms / -20.00%')
  report.rows[0].samples.native.forEach(sample => sample.ms = 0)
  report.rows[0].error = '</td><script>alert(1)</script>'
  expect(renderHtml(report)).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  expect(renderMarkdown(report)).toContain('80.00 ms / N/A%')
})
it('语义不稳定和版本错误的样本不能进入开销排名', () => {
  for (const mutate of [row => row.samples.enabled[0].semanticHash = 'different', row => row.version = '9.0.0']) {
    const report = example()
    mutate(report.rows[0])
    const row = summarizeRow(report.rows[0], report.settings, report)
    expect(row.comparable).toBe(false)
    expect(row.processing).toBeNull()
    expect(renderMarkdown(report)).not.toContain('-20.00 ms / -20.00%')
  }
})
it('汇总依据独立清单，拒绝错误版本和重复分片', async () => {
  const report = { ...example(), shard: 'shard-0' }
  const manifest = { ...example(), jobs: [{ id: 'shard-0', rows: report.rows }] }
  const file = path.join(await temp(), 'report.json')
  await writeFile(file, JSON.stringify(report))
  expect((await mergeReports(manifest, [file, file])).collectionErrors).toHaveLength(1)
  report.package.version = '9.0.0'
  await writeFile(file, JSON.stringify(report))
  expect((await mergeReports(manifest, [file])).collectionErrors.some(error => error.includes('发布版身份'))).toBe(true)
})
it('中断分片保留已取得样本并显式标记中断原因', async () => {
  const report = { ...example(), shard: 'shard-0' }
  report.rows[0].status = 'pending'
  report.rows[0].samples.static.pop()
  const manifest = { ...example(), jobs: [{ id: 'shard-0', rows: report.rows }] }
  const file = path.join(await temp(), 'report.json')
  await writeFile(file, JSON.stringify(report))
  const merged = await mergeReports(manifest, [file])
  expect(merged.rows[0].status).toBe('interrupted')
  expect(merged.rows[0].samples.enabled).toHaveLength(7)
  expect(renderMarkdown(merged)).toContain('分片未完成')
  expect(summarizeRow(merged.rows[0]).processing).toBeNull()
})
it('进程树排除相邻任务，只统计子孙且可处理循环', () => {
  expect(treeRss([{ pid: 1, ppid: 0, bytes: 1024 ** 2 }, { pid: 2, ppid: 1, bytes: 2 * 1024 ** 2 }, { pid: 9, ppid: 0, bytes: 99 * 1024 ** 2 }], 1)).toBe(3)
  expect(treeRss([], 1)).toBeNull()
})
it('真实路径校验允许临时目录别名，拒绝仓库外链', async () => {
  const root = await temp()
  const project = path.join(root, 'project')
  const modules = path.join(project, 'node_modules', 'weapp-tailwindcss')
  await mkdir(modules, { recursive: true })
  await writeFile(path.join(project, 'package.json'), '{}')
  await writeFile(path.join(modules, 'package.json'), JSON.stringify({ name: 'weapp-tailwindcss', version: '1.2.3' }))
  await writeFile(path.join(project, 'pnpm-lock.yaml'), stringify({ importers: {}, snapshots: {}, packages: { 'weapp-tailwindcss@1.2.3': { resolution: { integrity: 'test' } } } }))
  const alias = path.join(root, 'alias')
  await symlink(project, alias, process.platform === 'win32' ? 'junction' : 'dir')
  expect((await assertPublished(alias, { version: '1.2.3', integrity: 'test' })).version).toBe('1.2.3')
})
