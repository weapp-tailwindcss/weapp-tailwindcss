import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import repositoryManifest from '../package.json'
import { dependencyVersions, prepareDependencies } from './issue-1241/dependencies'

const mocks = vi.hoisted(() => ({ execa: vi.fn() }))
vi.mock('execa', () => ({ execa: mocks.execa }))
const expectedVersion = repositoryManifest.packageManager.slice('pnpm@'.length)
const roots: string[] = []

async function fixture() {
  const temporary = await mkdtemp(path.join(tmpdir(), 'issue-1241-dependencies-test-'))
  roots.push(temporary)
  return { temporary, root: path.join(temporary, 'dependencies'), artifacts: path.join(temporary, 'evidence') }
}

async function installed(root: string) {
  for (const [name, version] of Object.entries(dependencyVersions)) {
    const directory = path.join(root, 'node_modules', name)
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name, version }))
  }
}

beforeEach(() => {
  mocks.execa.mockReset()
  vi.stubEnv('E2E_ISSUE_1241_DEPENDENCIES', undefined)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Issue 1241 临时安装身份与首次准备失败证据', () => {
  it('从根 manifest 固定 pnpm，先验证实际版本，再安装并核对依赖', async () => {
    const item = await fixture()
    mocks.execa.mockImplementation(async (_command, args, options) => {
      expect(JSON.parse(await readFile(path.join(item.root, 'package.json'), 'utf8')).packageManager).toBe(repositoryManifest.packageManager)
      if (args.at(-1) === '--version') {
        return { stdout: expectedVersion, stderr: '' }
      }
      expect(args.slice(-2)).toEqual(['install', '--ignore-scripts'])
      expect(options.timeout).toBe(120_000)
      await installed(item.root)
      return { stdout: 'installed all fixed dependencies', stderr: '' }
    })
    expect(await prepareDependencies(item.temporary, item.artifacts)).toBe(item.root)
    expect(mocks.execa).toHaveBeenCalledTimes(2)
    const report = JSON.parse(await readFile(path.join(item.artifacts, 'report.json'), 'utf8'))
    expect(report).toMatchObject({ status: 'passed', phase: 'verify-dependencies', packageManager: repositoryManifest.packageManager, actualPnpm: expectedVersion, root: item.root, node: process.version })
    expect(await readFile(path.join(item.artifacts, 'install.log'), 'utf8')).toContain('installed all fixed dependencies')
  })

  it('实际 pnpm 漂移时零安装，保存要求与实际身份', async () => {
    const item = await fixture()
    mocks.execa.mockResolvedValue({ stdout: '99.0.0', stderr: '' })
    await expect(prepareDependencies(item.temporary, item.artifacts)).rejects.toThrow('pnpm 版本不符')
    expect(mocks.execa).toHaveBeenCalledOnce()
    expect(JSON.parse(await readFile(path.join(item.artifacts, 'report.json'), 'utf8'))).toMatchObject({ status: 'failed', phase: 'verify-pnpm', actualPnpm: '99.0.0', packageManager: repositoryManifest.packageManager })
    expect(await readFile(path.join(item.artifacts, 'version.log'), 'utf8')).toContain('99.0.0')
  })

  it('安装超时保留原异常、输出与身份，不因已输出 Done 改成通过', async () => {
    const item = await fixture()
    const error = Object.assign(new Error('Command timed out after 120000 milliseconds'), { timedOut: true, stdout: `Done in 3m 39.8s using pnpm v${expectedVersion}`, stderr: 'first install stderr', signal: 'SIGTERM' })
    mocks.execa.mockResolvedValueOnce({ stdout: expectedVersion, stderr: '' }).mockRejectedValueOnce(error)
    const failed = await prepareDependencies(item.temporary, item.artifacts).catch(caught => caught)
    expect(failed.cause).toBe(error)
    expect(failed.message).toContain(item.artifacts)
    expect(mocks.execa).toHaveBeenCalledTimes(2)
    expect(JSON.parse(await readFile(path.join(item.artifacts, 'report.json'), 'utf8'))).toMatchObject({ status: 'failed', phase: 'install', actualPnpm: expectedVersion, failure: { timedOut: true, signal: 'SIGTERM' } })
    expect(await readFile(path.join(item.artifacts, 'install.log'), 'utf8')).toContain(error.stdout)
    expect(await readFile(path.join(item.artifacts, 'install.log'), 'utf8')).toContain(error.stderr)
  })

  it('版本探针启动失败也保留准备路径，且不启动安装', async () => {
    const item = await fixture()
    const error = Object.assign(new Error('pnpm entry missing'), { code: 'ENOENT', stderr: 'not found' })
    mocks.execa.mockRejectedValueOnce(error)
    await expect(prepareDependencies(item.temporary, item.artifacts)).rejects.toMatchObject({ cause: error })
    expect(mocks.execa).toHaveBeenCalledOnce()
    expect(JSON.parse(await readFile(path.join(item.artifacts, 'report.json'), 'utf8'))).toMatchObject({ status: 'failed', phase: 'verify-pnpm', root: item.root, failure: { code: 'ENOENT' } })
    expect(await readFile(path.join(item.artifacts, 'version.log'), 'utf8')).toContain('not found')
  })

  it('安装命令成功后仍拒绝错误依赖版本，并保留安装日志', async () => {
    const item = await fixture()
    mocks.execa.mockResolvedValueOnce({ stdout: expectedVersion, stderr: '' }).mockImplementationOnce(async () => {
      await installed(item.root)
      await writeFile(path.join(item.root, 'node_modules', 'vue', 'package.json'), JSON.stringify({ name: 'vue', version: '0.0.0' }))
      return { stdout: 'installation finished', stderr: '' }
    })
    await expect(prepareDependencies(item.temporary, item.artifacts)).rejects.toThrow('复现依赖版本不符：vue')
    expect(JSON.parse(await readFile(path.join(item.artifacts, 'report.json'), 'utf8'))).toMatchObject({ status: 'failed', phase: 'verify-dependencies' })
    expect(await readFile(path.join(item.artifacts, 'install.log'), 'utf8')).toContain('installation finished')
  })

  it('显式复用目录不能缺失工具链声明，失败时不修改借用项目', async () => {
    const item = await fixture()
    await mkdir(item.root)
    const manifest = JSON.stringify({ private: true })
    await writeFile(path.join(item.root, 'package.json'), manifest)
    vi.stubEnv('E2E_ISSUE_1241_DEPENDENCIES', item.root)
    await expect(prepareDependencies(item.temporary, item.artifacts)).rejects.toThrow('复用项目的 pnpm 声明与仓库不符')
    expect(mocks.execa).not.toHaveBeenCalled()
    expect(await readFile(path.join(item.root, 'package.json'), 'utf8')).toBe(manifest)
    expect(JSON.parse(await readFile(path.join(item.artifacts, 'report.json'), 'utf8'))).toMatchObject({ status: 'failed', phase: 'manifest', reused: true })
  })
})
