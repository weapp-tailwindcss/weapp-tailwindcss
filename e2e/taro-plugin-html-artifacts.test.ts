import type { PluginHtmlBuildExecution } from '../scripts/taro-plugin-html-style-snapshots/artifacts'
import type { PluginHtmlMode } from '../scripts/taro-plugin-html-style-snapshots/report'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { createPluginHtmlArtifactArchive, finishPluginHtmlRun, resolvePluginHtmlArchiveMode } from '../scripts/taro-plugin-html-style-snapshots/artifacts'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin html 归档-'))
  directories.push(root)
  return { root, projectRoot: path.join(root, 'project'), archiveRoot: path.join(root, 'archive') }
}

function execution(mode: PluginHtmlMode, passed = true): PluginHtmlBuildExecution {
  return { result: { mode, status: passed ? 'passed' : 'failed', command: 'pnpm run build:weapp', durationMs: 12, artifacts: [], ...(passed ? {} : { error: 'compiler failure' }) }, output: Buffer.from([0x41, 0xFF, 0x0A]), exitCode: passed ? 0 : 2, signal: null }
}

it('未设置可选归档时不读取来源身份或创建文件', async () => {
  const identify = vi.fn(async () => {
    throw new Error('不应执行')
  })
  expect(await createPluginHtmlArtifactArchive(undefined, identify)).toBeUndefined()
  expect(await createPluginHtmlArtifactArchive('', identify)).toBeUndefined()
  expect(identify).not.toHaveBeenCalled()
})

it('两模式分别在下一次清理前复制真实产物，保留原始日志字节和命令状态', async () => {
  const f = await fixture()
  const source = { head: 'exact-fixture-head', worktreeStatus: '', node: process.version }
  const archive = (await createPluginHtmlArtifactArchive(f.archiveRoot, async () => source))!
  for (const mode of ['with-plugin-html', 'without-plugin-html'] as const) {
    const output = path.join(f.projectRoot, 'dist')
    await fs.rm(output, { force: true, recursive: true })
    await fs.mkdir(path.join(output, 'pages'), { recursive: true })
    await fs.writeFile(path.join(output, 'pages', 'index.wxss'), mode)
    await fs.writeFile(path.join(output, 'app.js'), Buffer.from([0, 0xFF, mode.length]))
    await archive.capture('taro-fixture', f.projectRoot, execution(mode))
  }
  await fs.rm(f.projectRoot, { force: true, recursive: true })
  await archive.finish({ passed: true, verify: true })
  for (const mode of ['with-plugin-html', 'without-plugin-html'] as const) {
    const directory = resolvePluginHtmlArchiveMode(f.archiveRoot, 'taro-fixture', mode)
    expect(await fs.readFile(path.join(directory, 'production', 'pages', 'index.wxss'), 'utf8')).toBe(mode)
    expect(await fs.readFile(path.join(directory, 'production', 'app.js'))).toEqual(Buffer.from([0, 0xFF, mode.length]))
    expect(await fs.readFile(path.join(directory, 'build.log'))).toEqual(execution(mode).output)
    const report = JSON.parse(await fs.readFile(path.join(directory, 'report.json'), 'utf8'))
    expect(report).toMatchObject({ source, project: 'taro-fixture', mode, exitCode: 0, production: { status: 'captured' }, command: { file: 'pnpm', args: ['run', 'build:weapp'], cwd: f.projectRoot, env: { WEAPP_TW_TARO_PLUGIN_HTML: mode === 'with-plugin-html' ? '1' : '0' } } })
  }
  expect(JSON.parse(await fs.readFile(path.join(f.archiveRoot, 'report.json'), 'utf8'))).toMatchObject({ status: 'passed', verify: true, captures: [{ mode: 'with-plugin-html' }, { mode: 'without-plugin-html' }] })
})

it('失败构建没有 dist 时仍保留完整日志、错误与真实非零状态', async () => {
  const f = await fixture()
  const archive = (await createPluginHtmlArtifactArchive(f.archiveRoot, async () => ({ head: 'fixture' })))!
  await archive.capture('taro-fixture', f.projectRoot, execution('with-plugin-html', false))
  await archive.finish({ passed: false, verify: true, error: new Error('compiler failure') })
  const report = JSON.parse(await fs.readFile(path.join(f.archiveRoot, 'taro-fixture', 'with-plugin-html', 'report.json'), 'utf8'))
  expect(report).toMatchObject({ exitCode: 2, result: { status: 'failed', error: 'compiler failure' }, production: { status: 'absent-after-failed-build' } })
  expect(await fs.readFile(path.join(f.archiveRoot, 'taro-fixture', 'with-plugin-html', 'build.log'))).toEqual(execution('with-plugin-html').output)
  expect(JSON.parse(await fs.readFile(path.join(f.archiveRoot, 'report.json'), 'utf8'))).toMatchObject({ status: 'failed', error: expect.stringContaining('compiler failure') })
})

it('构建成功但 dist 缺失时归档失败，报告不可把缺失产物写成通过', async () => {
  const f = await fixture()
  const archive = (await createPluginHtmlArtifactArchive(f.archiveRoot, async () => ({})))!
  await expect(archive.capture('taro-fixture', f.projectRoot, execution('with-plugin-html'))).rejects.toThrow('dist 缺失')
  const report = JSON.parse(await fs.readFile(path.join(f.archiveRoot, 'taro-fixture', 'with-plugin-html', 'report.json'), 'utf8'))
  expect(report.production.status).toBe('pending')
  expect(report.archiveError).toContain('dist 缺失')
})

it('归档目录写入失败与旧模式证据均阻断，不覆盖此前的报告', async () => {
  const f = await fixture()
  await fs.writeFile(f.archiveRoot, 'occupied')
  await expect(createPluginHtmlArtifactArchive(f.archiveRoot, async () => ({}))).rejects.toThrow()
  await fs.rm(f.archiveRoot)
  const archive = (await createPluginHtmlArtifactArchive(f.archiveRoot, async () => ({})))!
  const runFile = path.join(f.archiveRoot, 'report.json')
  const runBefore = await fs.readFile(runFile)
  await expect(createPluginHtmlArtifactArchive(f.archiveRoot, async () => ({}))).rejects.toThrow()
  expect(await fs.readFile(runFile)).toEqual(runBefore)
  await archive.capture('taro-fixture', f.projectRoot, execution('with-plugin-html', false))
  const reportFile = path.join(f.archiveRoot, 'taro-fixture', 'with-plugin-html', 'report.json')
  const before = await fs.readFile(reportFile)
  await expect(archive.capture('taro-fixture', f.projectRoot, execution('with-plugin-html', false))).rejects.toThrow()
  expect(await fs.readFile(reportFile)).toEqual(before)
})

it('拒绝与真实 dist 重叠的归档目录', async () => {
  const f = await fixture()
  const identify = vi.fn(async () => ({}))
  await expect(createPluginHtmlArtifactArchive(path.join(f.projectRoot, 'dist'), identify, [path.join(f.projectRoot, 'dist')])).rejects.toThrow('重叠')
  expect(identify).not.toHaveBeenCalled()
  const archive = (await createPluginHtmlArtifactArchive(path.join(f.projectRoot, 'dist'), async () => ({})))!
  await expect(archive.capture('taro-fixture', f.projectRoot, execution('with-plugin-html'))).rejects.toThrow('重叠')
})

it('复制真实产物失败时保留失败原因与日志，并向调用方抛出原始错误', async () => {
  const f = await fixture()
  await fs.mkdir(path.join(f.projectRoot, 'dist'), { recursive: true })
  const archive = (await createPluginHtmlArtifactArchive(f.archiveRoot, async () => ({})))!
  const error = new Error('copy failure')
  const copy = vi.spyOn(fs, 'cp').mockRejectedValueOnce(error)
  try {
    await expect(archive.capture('taro-fixture', f.projectRoot, execution('with-plugin-html'))).rejects.toBe(error)
  }
  finally {
    copy.mockRestore()
  }
  const directory = path.join(f.archiveRoot, 'taro-fixture', 'with-plugin-html')
  expect(JSON.parse(await fs.readFile(path.join(directory, 'report.json'), 'utf8')).archiveError).toContain('copy failure')
  expect(await fs.readFile(path.join(directory, 'build.log'))).toEqual(execution('with-plugin-html').output)
})

it('默认流程执行原操作和暂存清理，保留原返回值', async () => {
  const cleanup = vi.fn(async () => {})
  const value = { original: true }
  expect(await finishPluginHtmlRun(async () => value, cleanup, undefined, true)).toBe(value)
  expect(cleanup).toHaveBeenCalledOnce()
})

it('暂存清理失败时最终归档也标失败，不记录提前通过', async () => {
  const f = await fixture()
  const archive = (await createPluginHtmlArtifactArchive(f.archiveRoot, async () => ({})))!
  const error = new Error('staging cleanup failure')
  await expect(finishPluginHtmlRun(async () => 'verified', async () => {
    throw error
  }, archive, true)).rejects.toBe(error)
  expect(JSON.parse(await fs.readFile(path.join(f.archiveRoot, 'report.json'), 'utf8'))).toMatchObject({ status: 'failed', verify: true, error: expect.stringContaining('staging cleanup failure') })
})

it('原操作与最终归档同时失败仍完成清理并保留两种异常', async () => {
  const f = await fixture()
  const archive = (await createPluginHtmlArtifactArchive(f.archiveRoot, async () => ({})))!
  const original = new Error('original verification failure')
  const write = new Error('final archive failure')
  vi.spyOn(archive, 'finish').mockRejectedValueOnce(write)
  const cleanup = vi.fn(async () => {})
  const result = await finishPluginHtmlRun(async () => {
    throw original
  }, cleanup, archive, true).catch(error => error)
  expect(cleanup).toHaveBeenCalledOnce()
  expect(result).toBeInstanceOf(AggregateError)
  expect(result.errors).toEqual([original, write])
})

it.each([
  [path.posix, '/archive root', '/archive root/taro-fixture/with-plugin-html'],
  [path.posix, './relative', path.posix.resolve('relative/taro-fixture/with-plugin-html')],
  [path.win32, 'C:\\archive root', 'C:\\archive root\\taro-fixture\\with-plugin-html'],
  [path.win32, 'D:\\', 'D:\\taro-fixture\\with-plugin-html'],
])('归档身份通过平台路径 API 解析：%s %s', (paths, root, expected) => {
  expect(resolvePluginHtmlArchiveMode(root, 'taro-fixture', 'with-plugin-html', paths)).toBe(expected)
  for (const project of ['../outside', '..\\outside', 'C:\\outside', '/root', 'a/b']) {
    expect(() => resolvePluginHtmlArchiveMode(root, project, 'with-plugin-html', paths)).toThrow('无效')
  }
})
