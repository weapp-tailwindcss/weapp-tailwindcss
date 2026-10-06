import type { HBuilderXCommandResult, HBuilderXRunner } from '../packages/hbuilderx-runner/src/types'
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createHBuilderXAppProject, supportsCanonicalHarmonyProject } from '../scripts/hbuilderx-app-project'

const state = vi.hoisted(() => ({ realpath: vi.fn() }))
vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  realpath: state.realpath,
}))
const nativeFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
let root: string
const run = vi.fn<HBuilderXRunner['run']>()
const resolution = { channel: 'alpha' as const, version: '5.31.2026093020-alpha', host: 'owned-host' }

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hbuilderx-app-project-'))
  state.realpath.mockReset().mockImplementation(nativeFs.realpath)
  run.mockReset().mockResolvedValue({} as HBuilderXCommandResult)
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

it.each([
  ['alpha', '5.31.2026093020-alpha', true],
  ['alpha', '5.32.2026100101-alpha', true],
  ['alpha', '5.30.2026080101-alpha', false],
  ['alpha', '5.14.2026060101-alpha', false],
  ['stable', '5.31.2026093020', false],
  ['unknown', '5.31.2026093020-alpha', false],
  ['alpha', undefined, false],
  ['alpha', '5.31unknown', false],
] as const)('只按已绑定 host 的能力选择 %s %s', (channel, version, expected) => {
  expect(supportsCanonicalHarmonyProject({ channel, ...(version ? { version } : {}) })).toBe(expected)
})

it.each([
  ['/workspace/link project', '/workspace/real project'],
  ['/', '/'],
  ['./work/../project', '/workspace/project'],
  [String.raw`C:\work\link project`, String.raw`C:\real project`],
  ['C:\\', 'C:\\'],
  [String.raw`\\server\share\link`, String.raw`\\server\share\real`],
])('规范化系统路径后原样传递，不改写分隔符或根：%s', async (input, canonical) => {
  state.realpath.mockResolvedValue(canonical)
  const session = await createHBuilderXAppProject({ projectRoot: input, platform: 'app-harmony', runner: { resolution, run }, timeoutMs: 1000 })
  expect(state.realpath).toHaveBeenCalledExactlyOnceWith(input)
  expect(session).toMatchObject({ kind: 'canonical-root', projectRoot: canonical, projectPath: canonical, launchProject: canonical })
  await session.open()
  await session.cleanup()
  await session.cleanup()
  expect(run).not.toHaveBeenCalled()
})

it('真实根解析失败不创建别名或调用 IDE', async () => {
  const failure = new Error('realpath unavailable')
  state.realpath.mockRejectedValue(failure)
  await expect(createHBuilderXAppProject({ projectRoot: root, platform: 'app-harmony', runner: { resolution, run }, timeoutMs: 1000 })).rejects.toBe(failure)
  expect(run).not.toHaveBeenCalled()
})

it.each(['app-android', 'app-ios', 'app-harmony'] as const)('%s 的旧版兼容分支只管理自己创建的别名', async (platform) => {
  const projectRoot = path.join(root, '中文 project')
  await mkdir(projectRoot)
  await writeFile(path.join(projectRoot, 'source.txt'), 'owned source')
  const host = { ...resolution, version: platform === 'app-harmony' ? '5.14.2026070101-alpha' : resolution.version }
  const session = await createHBuilderXAppProject({ projectRoot, platform, runner: { resolution: host, run }, timeoutMs: 1000 })
  try {
    expect(session.kind).toBe('owned-alias')
    expect(await nativeFs.realpath(session.projectPath)).toBe(await nativeFs.realpath(projectRoot))
    expect(session.launchProject).toBe(platform === 'app-harmony' ? session.projectPath : path.basename(session.projectPath))
    await session.open()
    await session.open()
    expect(run).toHaveBeenCalledExactlyOnceWith({ args: ['project', 'open', '--path', session.projectPath], cwd: projectRoot, timeoutMs: 1000 })
    await session.cleanup()
    await session.cleanup()
    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenLastCalledWith({ args: ['project', 'close', '--path', session.projectPath], cwd: projectRoot, timeoutMs: 1000, allowFailure: false })
    await expect(lstat(session.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(path.join(projectRoot, 'source.txt'), 'utf8')).toBe('owned source')
  }
  finally {
    run.mockResolvedValue({} as HBuilderXCommandResult)
    await session.cleanup()
  }
})

it('别名尚未打开时只删除本地别名，不关闭项目', async () => {
  const session = await createHBuilderXAppProject({ projectRoot: root, platform: 'app-ios', runner: { resolution, run }, timeoutMs: 1000 })
  await session.cleanup()
  expect(run).not.toHaveBeenCalled()
  await expect(lstat(session.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('打开响应失败也严格关闭本轮别名，关闭失败保留恢复入口', async () => {
  const session = await createHBuilderXAppProject({ projectRoot: root, platform: 'app-ios', runner: { resolution, run }, timeoutMs: 1000 })
  const openError = new Error('open response unavailable')
  const closeError = new Error('close timeout')
  try {
    run.mockRejectedValueOnce(openError).mockRejectedValueOnce(closeError)
    await expect(session.open()).rejects.toBe(openError)
    await expect(session.cleanup()).rejects.toMatchObject({ cause: closeError })
    expect((await lstat(session.projectPath)).isSymbolicLink()).toBe(true)
    expect(run).toHaveBeenLastCalledWith(expect.objectContaining({ args: ['project', 'close', '--path', session.projectPath], allowFailure: false }))
  }
  finally {
    await session.cleanup()
  }
  await expect(lstat(session.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
})
