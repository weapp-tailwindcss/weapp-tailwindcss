import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { assertNativeSessionsAvailable, claimNativeSession } from '../scripts/hbuilderx-native-registry'
import { nativeRegistryRoot, normalizeNativePath } from '../scripts/hbuilderx-native-registry/identity'
import { createNativeSessionRecovery } from '../scripts/hbuilderx-native-session'
import { prepareNativeFixture } from './hbuilderx-native-fixture'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-registry-'))
  roots.push(root)
  const host = await prepareNativeFixture(root)
  const file = path.join(root, 'App.uvue')
  await fs.writeFile(file, 'original')
  const options = { projectRoot: root, host, directory: path.join(root, 'evidence'), sessionId: 'first' }
  const recovery = { ...options, platform: 'app-ios', files: [{ file }] }
  const cleanup = { stop: () => {}, nativeStopReason: () => undefined, afterStop: () => {}, safe: [], release: [] }
  return { root, host, file, options, recovery, cleanup }
}

it('预检只读，不创建注册目录；原子领取只允许一个并发会话', async () => {
  const { root, host, options } = await fixture()
  await assertNativeSessionsAvailable(root, host)
  await expect(fs.stat(await nativeRegistryRoot(root))).rejects.toMatchObject({ code: 'ENOENT' })
  const results = await Promise.allSettled([claimNativeSession(options), claimNativeSession({ ...options, sessionId: 'second' })])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  await expect(assertNativeSessionsAvailable(root, host)).rejects.toThrow('未解除')
})

it.each(['\n', '\r\n'])('Git 换行 %j 的关联 worktree、不同项目和别名共享同 host 阻塞', async (newline) => {
  const { root, options } = await fixture()
  const worktree = path.join(root, 'linked-worktree')
  const gitDirectory = path.join(root, '.git', 'worktrees', 'linked')
  await fs.mkdir(worktree)
  await fs.mkdir(gitDirectory, { recursive: true })
  await fs.writeFile(path.join(worktree, '.git'), `gitdir: ${path.relative(worktree, gitDirectory)}${newline}`)
  await fs.writeFile(path.join(gitDirectory, 'commondir'), `${path.relative(gitDirectory, path.join(root, '.git'))}${newline}`)
  const alias = path.join(root, 'alias')
  const installationAlias = path.join(root, 'installation-alias')
  await fs.symlink(worktree, alias, process.platform === 'win32' ? 'junction' : 'dir')
  await fs.symlink(root, installationAlias, process.platform === 'win32' ? 'junction' : 'dir')
  const cliAlias = path.join(installationAlias, path.basename(options.host.path))
  expect(await nativeRegistryRoot(worktree)).toBe(await nativeRegistryRoot(root))
  await claimNativeSession(options)
  await expect(claimNativeSession({ ...options, projectRoot: path.relative(process.cwd(), alias), host: { ...options.host, path: cliAlias }, directory: path.join(root, 'other'), sessionId: 'new' })).rejects.toThrow('未解除')
})

it('不同 host 或安装拥有独立 slot，正常结束只删除自己的登记', async () => {
  const { root, options } = await fixture()
  const first = await claimNativeSession(options)
  const second = await claimNativeSession({ ...options, sessionId: 'second', host: { ...options.host, host: 'other-host' } })
  const cli = path.join(root, 'another-cli')
  await fs.writeFile(cli, 'other installation')
  const third = await claimNativeSession({ ...options, sessionId: 'third', host: { ...options.host, path: cli } })
  await second.release()
  await expect(first.assertOwner()).resolves.toBeUndefined()
  await expect(third.assertOwner()).resolves.toBeUndefined()
  await expect(assertNativeSessionsAvailable(root, { ...options.host, host: 'other-host' })).resolves.toBeUndefined()
})

it('关联 worktree 的 commondir 文件缺失不能转到私有 gitdir 绕过旧登记', async () => {
  const { root, options } = await fixture()
  await claimNativeSession(options)
  const worktree = path.join(root, 'worktree')
  const gitDirectory = path.join(root, '.git', 'worktrees', 'linked')
  await fs.mkdir(worktree)
  await fs.mkdir(gitDirectory, { recursive: true })
  await fs.writeFile(path.join(worktree, '.git'), `gitdir: ${gitDirectory}\n`)
  await fs.writeFile(path.join(gitDirectory, 'gitdir'), `${path.join(worktree, '.git')}\n`)
  await expect(claimNativeSession({ ...options, projectRoot: worktree, sessionId: 'new' })).rejects.toThrow('不可解析')
  await expect(fs.stat(path.join(gitDirectory, 'weapp-tailwindcss-native-sessions'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each(['dead-owner', 'invalid-json', 'unknown-schema', 'missing-record'])('%s 不自动解除或被新 UUID 绕过', async (kind) => {
  const { root, options } = await fixture()
  const first = await claimNativeSession(options)
  const file = path.join(first.directory, 'registration.json')
  const record = JSON.parse(await fs.readFile(file, 'utf8'))
  if (kind === 'missing-record') {
    await fs.unlink(file)
  }
  else { await fs.writeFile(file, kind === 'invalid-json' ? '{' : JSON.stringify({ ...record, ...(kind === 'dead-owner' ? { pid: 2147483647 } : { schema: 'unknown' }) })) }
  await expect(assertNativeSessionsAvailable(root, options.host)).rejects.toThrow('未解除')
  await expect(claimNativeSession({ ...options, sessionId: 'new' })).rejects.toThrow('未解除')
})

it('归属被改变后不能删除他人登记', async () => {
  const { options } = await fixture()
  const first = await claimNativeSession(options)
  const file = path.join(first.directory, 'registration.json')
  const changed = { ...JSON.parse(await fs.readFile(file, 'utf8')), sessionId: 'other-owner' }
  await fs.writeFile(file, JSON.stringify(changed))
  await expect(first.release()).rejects.toThrow('未解除')
  expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual(changed)
})

it('预检把悬空的 registry 根链接识别为损坏，不当作首次运行', async () => {
  const { root, host } = await fixture()
  const registry = await nativeRegistryRoot(root)
  await fs.mkdir(path.dirname(registry), { recursive: true })
  await fs.symlink(path.join(root, 'missing-registry'), registry, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(assertNativeSessionsAvailable(root, host)).rejects.toThrow('不可读取')
  expect((await fs.lstat(registry)).isSymbolicLink()).toBe(true)
})

it('多个变体成功清理仍保留领取，整个 scope 完成后才允许下一会话', async () => {
  const { root, host, file, recovery: options, cleanup } = await fixture()
  const recovery = await createNativeSessionRecovery(options)
  for (const variant of ['first', 'second']) {
    await recovery.beginMutation()
    await fs.writeFile(file, variant)
    await recovery.cleanup(cleanup)
    expect(await fs.readFile(file, 'utf8')).toBe('original')
    await expect(assertNativeSessionsAvailable(root, host)).rejects.toThrow('未解除')
  }
  await recovery.finish()
  await recovery.finish()
  await expect(recovery.beginMutation()).rejects.toThrow('未解除')
  const second = await createNativeSessionRecovery(options)
  await second.finish()
})

it('创建备份失败发生于 mutation 前，只释放自己的领取', async () => {
  const { root, host, recovery } = await fixture()
  const blocked = path.join(root, 'not-directory')
  await fs.writeFile(blocked, 'file')
  await expect(createNativeSessionRecovery({ ...recovery, directory: path.join(blocked, 'nested') })).rejects.toThrow()
  await expect(assertNativeSessionsAvailable(root, host)).resolves.toBeUndefined()
})

it('验收断言失败但停止、恢复与资源释放全部成功时可以解除', async () => {
  const { root, host, recovery: options, cleanup } = await fixture()
  const recovery = await createNativeSessionRecovery(options)
  await recovery.beginMutation()
  await expect(recovery.cleanup({ ...cleanup, afterStop: () => {
    throw new Error('HMR restarted')
  } })).rejects.toThrow('HMR restarted')
  expect(recovery.cleanupComplete).toBe(true)
  await recovery.finish()
  await expect(assertNativeSessionsAvailable(root, host)).resolves.toBeUndefined()
})

it.each(['restore', 'release'])('%s 失败不能由 finish 或下一轮成功收尾解除', async (kind) => {
  const { root, host, file, recovery: options, cleanup } = await fixture()
  const recovery = await createNativeSessionRecovery(options)
  await recovery.beginMutation()
  await fs.writeFile(file, 'changed')
  if (kind === 'restore') {
    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('restore failure'))
  }
  await expect(recovery.cleanup({ ...cleanup, release: kind === 'release'
    ? [async () => {
        throw new Error('release failure')
      }]
    : [] })).rejects.toThrow(`${kind} failure`)
  await expect(recovery.finish()).rejects.toThrow('未解除')
  await recovery.cleanup(cleanup)
  await expect(recovery.beginMutation()).rejects.toThrow('未解除')
  await expect(recovery.finish()).rejects.toThrow('未解除')
  await expect(assertNativeSessionsAvailable(root, host)).rejects.toThrow('未解除')
})

it.each(['non-git', 'invalid-git', 'missing-common', 'invalid-common', 'unwritable'])('%s 注册环境失败时明确阻断，不回退临时目录', async (kind) => {
  const { root, options } = await fixture()
  if (kind === 'non-git' || kind === 'invalid-git') {
    await fs.rm(path.join(root, '.git'), { recursive: true })
    if (kind === 'invalid-git') {
      await fs.writeFile(path.join(root, '.git'), 'invalid')
    }
  }
  else if (kind === 'missing-common' || kind === 'invalid-common') {
    await fs.writeFile(path.join(root, '.git', 'commondir'), kind === 'missing-common' ? 'does-not-exist' : '\n')
  }
  else {
    await fs.writeFile(path.join(root, '.git', 'weapp-tailwindcss-native-sessions'), 'not-directory')
  }
  await expect(claimNativeSession(options)).rejects.toThrow(/Git|持久目录/u)
})

it.each([
  { value: '../project', cwd: '/repo/worktree', windows: false, expected: '/repo/project' },
  { value: '/', cwd: '/repo', windows: false, expected: '/' },
  { value: '..\\Project', cwd: 'C:\\Repo\\worktree', windows: true, expected: 'c:\\repo\\project' },
  { value: 'D:\\Project\\..\\App', cwd: 'C:\\Repo', windows: true, expected: 'd:\\app' },
  { value: '\\', cwd: 'C:\\Repo', windows: true, expected: 'c:\\' },
])('文件身份规范化 $value', ({ value, cwd, windows, expected }) => {
  expect(normalizeNativePath(value, cwd, windows)).toBe(expected)
})
