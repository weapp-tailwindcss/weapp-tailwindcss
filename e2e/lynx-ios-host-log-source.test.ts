import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { readPreparedIosBuild } from './lynx/ios-build-target'
import { bindIosHostLogs, isInsideLogDirectory } from './lynx/ios-host-log-source'
import { command } from './lynx/native-command'

vi.mock('./lynx/native-command', () => ({ command: vi.fn() }))
const roots: string[] = []
const sha = 'a'.repeat(40)
const identity = { runId: '123', runAttempt: '2' }
const target = { platform: 'ios' as const, id: 'selected', name: '设备', runtime: 'runtime', destination: 'platform=iOS Simulator,id=selected', state: 'Shutdown' as const }
const inventory = (logPath?: unknown) => JSON.stringify({ devices: { runtime: [{ udid: 'selected', name: '设备', state: 'Shutdown', isAvailable: true, logPath }] } })

afterEach(async () => {
  vi.resetAllMocks()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

it('日志来源绑定同一库存原文、设备、runtime、run、attempt和checkout，执行身份保持独立', () => {
  const logPath = path.resolve('device logs', 'selected')
  const raw = inventory(logPath)
  expect(bindIosHostLogs(raw, target, identity, sha)).toEqual({
    status: 'bound',
    logPath,
    deviceId: target.id,
    runtime: target.runtime,
    ...identity,
    sha,
    inventorySha256: createHash('sha256').update(raw).digest('hex'),
  })
  expect(target).not.toHaveProperty('logPath')
})

it.each([undefined, null, 17, '', 'selected', path.parse(path.resolve('selected')).root, path.resolve('other'), `${path.resolve('selected')}\0`])('日志路径缺失或不是独占绝对目录（%s）仅令诊断不可用', (logPath) => {
  expect(bindIosHostLogs(inventory(logPath), target, identity, sha)).toMatchObject({ status: 'unavailable' })
})

it.each([
  [path.posix, '/logs/device', '/logs/device/a', true],
  [path.posix, '/logs/device', '/logs/device-other/a', false],
  [path.posix, '/logs/device', '/logs/device/../other/a', false],
  [path.posix, '/logs/device', '/logs/device', false],
  [path.posix, '/logs/device', 'relative/a', false],
  [path.win32, 'C:\\logs\\device', 'C:\\logs\\device\\a', true],
  [path.win32, 'C:\\logs\\device', 'C:/logs/device/a', true],
  [path.win32, 'C:\\logs\\device', 'D:\\logs\\device\\a', false],
  [path.win32, 'C:\\logs\\device', 'C:\\logs\\device-other\\a', false],
  [path.win32, 'C:\\logs\\device', 'C:relative', false],
  [path.win32, '\\\\server\\share\\device', '\\\\server\\share\\device\\a', true],
  [path.win32, '\\\\server\\share\\device', '\\\\other\\share\\device\\a', false],
])('目录边界按实际路径语义区分盘符、根和相对路径', (paths, root, file, expected) => {
  expect(isInsideLogDirectory(root, file, paths)).toBe(expected)
})

it('原准备文件校验时一次性取得日志来源，之后无需重查git或设备，也不读取日志目录', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-log-binding-'))
  roots.push(root)
  const file = path.join(root, 'manifest.json')
  const logPath = path.join(root, 'selected')
  await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, ...identity, sha, inventory: inventory(logPath), target }))
  vi.mocked(command).mockResolvedValue(sha)
  const open = vi.spyOn(fs, 'opendir')
  const prepared = await readPreparedIosBuild(root, { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'macOS', GITHUB_RUN_ID: identity.runId, GITHUB_RUN_ATTEMPT: identity.runAttempt, LYNX_IOS_DEVICE_ID: target.id, LYNX_IOS_BUILD_TARGET_FILE: file })
  expect(prepared?.target).toEqual(target)
  expect(prepared?.hostLogs).toMatchObject({ status: 'bound', logPath, ...identity, sha })
  expect(command).toHaveBeenCalledExactlyOnceWith('git', ['rev-parse', 'HEAD'], root, 30_000)
  expect(open).not.toHaveBeenCalled()
  open.mockRestore()
})
