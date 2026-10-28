import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installationEnvironment } from '../../../../../../scripts/release-nightly/installation/environment.mjs'
import { installPublishedNightly } from '../../../../../../scripts/release-nightly/installation/index.mjs'
import { failure, missing, published } from './fixture'

let root: string
let directory: string
let evidenceFile: string
const success = { exitCode: 0, stdout: '', stderr: '' }
const evidence = async () => JSON.parse(await readFile(evidenceFile, 'utf8'))

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'nightly-install-test-'))
  directory = path.join(root, 'consumer')
  evidenceFile = path.join(root, 'reports', 'install.json')
  await mkdir(directory)
})
afterEach(async () => rm(root, { recursive: true, force: true }))

it('缺版本后使用全新隔离缓存，仅清理当前消费者的部分安装并保留每次证据', async () => {
  const shared = path.join(root, 'shared')
  await mkdir(shared)
  await writeFile(path.join(shared, 'keep'), 'shared cache')
  await writeFile(path.join(directory, 'package.json'), '{}')
  let previousState: string
  const sleep = vi.fn(async () => {})
  const run = vi.fn(async (args: string[], options: any) => {
    const state = path.dirname(args.find(arg => arg.startsWith('--store-dir='))!.slice('--store-dir='.length))
    expect(options).toMatchObject({ cwd: directory, extendEnv: false, reject: false, timeout: 120_000 })
    expect(options.env.npm_config_registry).toBe('https://registry.npmjs.org/')
    expect(await readFile(options.env.npm_config_userconfig, 'utf8')).toBe('')
    expect(args).toEqual(expect.arrayContaining(['--ignore-scripts', '--reporter=ndjson', '--no-prefer-offline', '--no-offline', '--config.ignore-pnpmfile=true']))
    if (run.mock.calls.length === 1) {
      previousState = state
      await mkdir(path.join(directory, 'node_modules'))
      await writeFile(path.join(directory, 'pnpm-lock.yaml'), 'partial')
      return failure(missing())
    }
    expect(state).not.toBe(previousState)
    expect(await readdir(directory)).not.toContain(path.basename(previousState))
    expect(await readdir(directory)).not.toContain('node_modules')
    expect(await readdir(directory)).not.toContain('pnpm-lock.yaml')
    expect((await evidence()).attempts[0].stdout).toContain('ERR_PNPM_NO_MATCHING_VERSION')
    return success
  })
  await installPublishedNightly(published(), directory, evidenceFile, { run, sleep, now: () => 0 })
  expect(run).toHaveBeenCalledTimes(2)
  expect(sleep).toHaveBeenCalledExactlyOnceWith(2_000)
  expect(await readFile(path.join(shared, 'keep'), 'utf8')).toBe('shared cache')
  expect(await readFile(path.join(directory, 'package.json'), 'utf8')).toBe('{}')
  expect(await evidence()).toMatchObject({ status: 'installed', elapsedMs: 2_000, buildId: '123-1', attempts: [{ attempt: 1, retryable: true }, { attempt: 2, exitCode: 0 }] })
})

it.each([
  { ...failure(missing()), timedOut: true },
  { ...failure(missing()), signal: 'SIGTERM' },
  { ...success, failed: true, cause: new Error('process identity conflict') },
  { ...failure(missing()), code: 'EPIPE' },
  failure(missing('another@1.0.0')),
  failure(missing(undefined, { code: 'ERR_PNPM_TARBALL_INTEGRITY' })),
  { exitCode: 1, stdout: 'unknown error', stderr: '' },
  undefined,
])('不可识别或不可恢复的失败只运行一次并保存现场 %#', async (result) => {
  await mkdir(path.join(directory, 'node_modules'))
  const run = vi.fn(async () => result)
  const sleep = vi.fn(async () => {})
  await expect(installPublishedNightly(published(), directory, evidenceFile, { run, sleep })).rejects.toThrow('installation failed')
  expect(run).toHaveBeenCalledTimes(1)
  expect(sleep).not.toHaveBeenCalled()
  expect(await readdir(directory)).toContain('node_modules')
  expect(await evidence()).toMatchObject({ status: 'failed', attempts: [{ retryable: false }] })
})

it('进程启动抛错保存诊断且不重试', async () => {
  const error = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
  const run = vi.fn(async () => { throw error })
  await expect(installPublishedNightly(published(), directory, evidenceFile, { run })).rejects.toBe(error)
  expect(run).toHaveBeenCalledTimes(1)
  expect(await evidence()).toMatchObject({ status: 'failed', attempts: [{ code: 'ENOENT', error: 'Error: spawn ENOENT' }] })
})

it('达到次数上限保留终止尝试的缓存与诊断', async () => {
  const run = vi.fn(async () => failure(missing()))
  const sleep = vi.fn(async () => {})
  await expect(installPublishedNightly(published(), directory, evidenceFile, { run, sleep, now: () => 0, maxAttempts: 3 })).rejects.toThrow('visibility budget exhausted')
  expect(run).toHaveBeenCalledTimes(3)
  expect(sleep.mock.calls.map(call => call[0])).toEqual([2_000, 4_000])
  const report = await evidence()
  expect(report).toMatchObject({ status: 'visibility-exhausted', elapsedMs: 6_000 })
  expect(report.attempts).toHaveLength(3)
  expect(await readdir(directory)).toEqual([path.basename(report.attempts[2].state)])
})

it('安装和模拟退避共用总预算，下一条命令只领取剩余时间', async () => {
  let elapsed = 0
  const run = vi.fn(async (_args, options) => {
    expect(options.timeout).toBe(run.mock.calls.length === 1 ? 10_000 : 5_000)
    elapsed += 3_000
    return failure(missing())
  })
  const sleep = vi.fn(async () => {})
  await expect(installPublishedNightly(published(), directory, evidenceFile, { run, sleep, now: () => elapsed, budgetMs: 10_000 })).rejects.toThrow('visibility budget exhausted')
  expect(run).toHaveBeenCalledTimes(2)
  expect(sleep).toHaveBeenCalledExactlyOnceWith(2_000)
  expect(await evidence()).toMatchObject({ status: 'visibility-exhausted', elapsedMs: 8_000 })
})

it.each([
  (report: any) => { report.confirmed = false },
  (report: any) => { report.status = 'prepared' },
  (report: any) => { report.snapshot.registry = 'https://registry.example.test/' },
  (report: any) => { report.packages[0].published = false },
  (report: any) => { report.packages[0].version = 'snapshot-nightly' },
  (report: any) => { report.packages.push(report.packages[0]) },
])('未确认批次在运行 pnpm 前被拒绝 %#', async (mutate) => {
  const report = published()
  mutate(report)
  const run = vi.fn()
  await expect(installPublishedNightly(report, directory, evidenceFile, { run })).rejects.toThrow()
  expect(run).not.toHaveBeenCalled()
})

it('子进程环境不继承认证与用户 npm/pnpm 配置，并保留 Windows 启动变量', () => {
  const env = installationEnvironment({ PATH: 'path', Path: 'windows-path', HOME: 'home', USERPROFILE: 'C:\\Users\\runner', SystemRoot: 'C:\\Windows', ComSpec: 'C:\\Windows\\cmd.exe', npm_config_registry: 'private', NPM_TOKEN: 'secret', NODE_AUTH_TOKEN: 'secret', PNPM_HOME: 'shared' }, directory)
  expect(env).toMatchObject({ PATH: 'path', Path: 'windows-path', HOME: 'home', USERPROFILE: 'C:\\Users\\runner', SystemRoot: 'C:\\Windows', ComSpec: 'C:\\Windows\\cmd.exe', npm_config_registry: 'https://registry.npmjs.org/' })
  expect(env).not.toHaveProperty('NPM_TOKEN')
  expect(env).not.toHaveProperty('NODE_AUTH_TOKEN')
  expect(env).not.toHaveProperty('PNPM_HOME')
  expect(env.npm_config_userconfig).toBe(path.join(directory, 'user.npmrc'))
})
