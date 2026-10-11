import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import YAML from 'yaml'
import { runOwnedWorker } from '../../../../scripts/e2e-preflight/process'
import { runProxy, updatePackages } from '../../../../scripts/update-packages'
import { writeIntent } from '../../../../scripts/update-packages/intent'
import { fixture, releaseStatus } from './fixture'

const ok = { code: 0, signal: null }
const logger = { info: vi.fn(), error: vi.fn() }

async function setup() {
  const f = await fixture()
  const upgrade = (version: string) => f.pkg('packages/a', { name: '@fixture/a', dependencies: { lib: version } })
  await upgrade('^1.0.0')
  return { ...f, upgrade }
}

describe('更新命令自动累积 changeset', () => {
  it.each(['-ri', '-rLi'])('更新成功后生成中文 patch，并原样传递 %s 与过滤参数', async (mode) => {
    const f = await setup()
    await f.write('upgrade.mjs', `
      import fs from 'node:fs'
      import path from 'node:path'
      const manifest = path.join('packages', 'a', 'package.json')
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'))
      pkg.dependencies.lib = '^1.1.0'
      fs.writeFileSync(manifest, JSON.stringify(pkg))
    `)
    const run = vi.fn((args: string[], cwd: string) => runProxy(args, cwd, path.join(f.root, 'upgrade.mjs')))
    const args = ['up', mode, '--filter', './packages/*', '--filter', '!./demo/*uni-app*']
    expect(await updatePackages(args, { cwd: f.root, run, logger })).toEqual(ok)
    expect(run).toHaveBeenCalledWith(args, f.root)
    const files = await readdir(path.join(f.root, '.changeset'))
    expect(files).toHaveLength(1)
    const content = await f.read(path.join('.changeset', files[0]!))
    expect(YAML.parse(content.split('---')[1]!)).toEqual({ '@fixture/a': 'patch' })
    expect(content).toContain('更新依赖')
    expect(content).toContain('^1.0.0')
    expect(content).toContain('^1.1.0')
  })

  it('连续更新、手工 intent 和文件名碰撞均保留历史内容，pnpm 正确合并 bump', async () => {
    const f = await setup()
    const manual = '---\n"@fixture/a": minor\n---\n\n手工功能说明。\n'
    await f.write('.changeset/manual.md', manual)
    const unchanged = async () => ok
    await updatePackages(['up', '-ri'], { cwd: f.root, run: unchanged, logger })
    expect(await readdir(path.join(f.root, '.changeset'))).toEqual(['manual.md'])
    const run = async () => {
      await f.upgrade('^1.1.0')
      return ok
    }
    await updatePackages(['up', '-ri'], { cwd: f.root, run, logger })
    const firstFiles = await readdir(path.join(f.root, '.changeset'))
    const firstContents = await Promise.all(firstFiles.map(file => f.read(path.join('.changeset', file))))
    await updatePackages(['up', '-rLi'], { cwd: f.root, logger, run: async () => {
      await f.upgrade('^1.2.0')
      return ok
    } })
    expect(await readdir(path.join(f.root, '.changeset'))).toHaveLength(3)
    expect(await Promise.all(firstFiles.map(file => f.read(path.join('.changeset', file))))).toEqual(firstContents)
    const status = await releaseStatus(f.root)
    expect(status.exitCode, status.stderr).toBe(0)
    expect(status.stdout).toContain('1.1.0')
    expect(status.stdout).toContain('minor')
    await f.write('.changeset/manual.md', manual.replace('minor', 'major'))
    const major = await releaseStatus(f.root)
    expect(major.exitCode, major.stderr).toBe(0)
    expect(major.stdout).toContain('2.0.0')
    expect(major.stdout).toContain('major')
  })

  it('重复 patch 在真实发布计划中只提升一次 patch，碰撞后换名', async () => {
    const f = await setup()
    const change = [{ name: '@fixture/a', dependencies: [{ section: 'dependencies' as const, name: 'lib', before: { declaration: '^1', range: '^1' }, after: { declaration: '^2', range: '^2' } }] }]
    await writeIntent(f.root, change, () => 'same')
    const previous = await f.read('.changeset/dependency-update-same.md')
    const ids = ['same', 'different']
    await writeIntent(f.root, change, () => ids.shift()!)
    expect(await f.read('.changeset/dependency-update-same.md')).toBe(previous)
    expect(await readdir(path.join(f.root, '.changeset'))).toHaveLength(2)
    const status = await releaseStatus(f.root)
    expect(status.exitCode, status.stderr).toBe(0)
    expect(status.stdout).toContain('1.0.1')
    expect(status.stdout).not.toContain('1.0.2')
    await expect(writeIntent(f.root, change, () => 'same')).rejects.toThrow('已有记录未被覆盖')
    expect(await f.read('.changeset/dependency-update-same.md')).toBe(previous)
  })

  it.each([{ code: 2, signal: null }, { code: null, signal: 'SIGINT' as const }])('升级失败或取消时返回原状态 %j', async (result) => {
    const f = await setup()
    expect(await updatePackages(['up'], { cwd: f.root, logger, run: async () => {
      await f.upgrade('^2')
      return result
    } })).toEqual(result)
    await expect(readdir(path.join(f.root, '.changeset'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('快照失败时阻止升级，启动失败返回非零，记录失败提示依赖可能已更新', async () => {
    const f = await setup()
    const run = vi.fn(async () => ok)
    await f.write('pnpm-lock.yaml', 'importers: [')
    expect(await updatePackages(['up'], { cwd: f.root, run, logger })).toEqual({ code: 1, signal: null })
    expect(run).not.toHaveBeenCalled()
    await f.lock({})
    expect(await updatePackages(['up'], { cwd: f.root, logger, run: async () => {
      throw new Error('启动失败')
    } })).toEqual({ code: 1, signal: null })
    await f.write('.changeset', '这是文件，不是目录')
    const error = vi.fn()
    expect(await updatePackages(['up'], { cwd: f.root, logger: { info: vi.fn(), error }, run: async () => {
      await f.upgrade('^2')
      return ok
    } })).toEqual({ code: 1, signal: null })
    expect(error.mock.calls.flat().join(' ')).toContain('依赖可能已经更新')
  })

  it('真实子进程适配器保留 cwd、参数和退出码，入口脚本可以独立运行', async () => {
    const f = await setup()
    const proxy = path.join(f.root, 'fake-proxy.mjs')
    await f.write('fake-proxy.mjs', 'import fs from "node:fs"; fs.writeFileSync("args.json", JSON.stringify(process.argv.slice(2))); process.exit(7)')
    expect(await runProxy(['up', '-ri', '--filter', './packages/*'], f.root, proxy)).toEqual({ code: 7, signal: null })
    expect(JSON.parse(await f.read('args.json'))).toEqual(['up', '-ri', '--filter', './packages/*'])
    // help 不升级依赖，用真实代理验证 CLI 的模块入口和退出流程。
    const script = fileURLToPath(new URL('../../../../scripts/update-packages.ts', import.meta.url))
    const output = await runOwnedWorker({
      command: process.execPath,
      args: ['--import', import.meta.resolve('tsx'), script, '--help'],
      cwd: f.root,
      timeoutMs: 15_000,
    })
    expect(output).toMatch(/Usage|用法/)
  })

  it.each([['--help'], ['-h'], ['up', '--help'], ['update', '-h'], ['help', 'up']])('帮助请求 %j 不读取依赖快照或生成发布记录', async (...args) => {
    const f = await setup()
    await f.write('pnpm-lock.yaml', 'importers: [')
    const run = vi.fn(async () => ok)
    const info = vi.fn()
    expect(await updatePackages(args, { cwd: f.root, run, logger: { info, error: vi.fn() } })).toEqual(ok)
    expect(run).toHaveBeenCalledWith(args, f.root)
    expect(info).not.toHaveBeenCalled()
    await expect(readdir(path.join(f.root, '.changeset'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('两个 package scripts 均接入编排入口，保留升级模式及 demo 排除项', async () => {
    const { scripts } = JSON.parse(await readFile(new URL('../../../../package.json', import.meta.url), 'utf8'))
    for (const [name, mode] of [['up:pkg', '-ri'], ['up:pkg:latest', '-rLi']]) {
      expect(scripts[name!]).toBe(`tsx scripts/update-packages.ts up ${mode} --filter "./packages/*" --filter "./packages-runtime/*" --filter "./demo/*" --filter "./demo/web/*" --filter "!./demo/*uni-app*" --filter "!./demo/issue-uview-plus-cssentries"`)
    }
  })

  it('仅 demo 或 private 更新，以及成功后快照读取失败，不生成错误的发布记录', async () => {
    const f = await setup()
    await f.pkg('demo/a', { name: 'demo', dependencies: { lib: '^1' } })
    await f.pkg('packages/private', { name: 'private', private: true, dependencies: { lib: '^1' } })
    expect(await updatePackages(['up'], { cwd: f.root, logger, run: async () => {
      await f.pkg('demo/a', { name: 'demo', dependencies: { lib: '^2' } })
      await f.pkg('packages/private', { name: 'private', private: true, dependencies: { lib: '^2' } })
      return ok
    } })).toEqual(ok)
    await expect(readdir(path.join(f.root, '.changeset'))).rejects.toMatchObject({ code: 'ENOENT' })
    const error = vi.fn()
    expect(await updatePackages(['up'], { cwd: f.root, logger: { info: vi.fn(), error }, run: async () => {
      await f.write('pnpm-lock.yaml', 'importers: [')
      return ok
    } })).toEqual({ code: 1, signal: null })
    expect(error.mock.calls.flat().join(' ')).toContain('依赖可能已经更新')
  })
})
