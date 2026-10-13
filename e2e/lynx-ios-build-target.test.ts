import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { prepareIosBuildTarget, readPreparedIosBuildTarget, withBuiltIosDevice } from './lynx/ios-build-target'
import { command } from './lynx/native-command'
import { selectIosBuildTarget, selectIosDevice } from './lynx/native-device'
import { runIos } from './lynx/run-ios'

vi.mock('./lynx/native-command', () => ({ command: vi.fn() }))
const invoke = vi.mocked(command)
const sha = '79bc7a68a14b4f736e675e7d5c98915cbff010ef'
const env = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'macOS', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', LYNX_IOS_DEVICE_ID: 'selected' }
function inventory(state = 'Shutdown', runtime = 'runtime-selected', available = true) {
  return JSON.stringify({ devices: {
    [runtime]: [{ udid: 'selected', name: '设备', state, isAvailable: available }],
    other: [{ udid: 'other', name: '其他设备', state: 'Booted', isAvailable: true }],
  } })
}
const target = () => selectIosBuildTarget(inventory(), env)
const roots: string[] = []
beforeEach(() => vi.resetAllMocks())
afterEach(async () => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

async function manifestFile() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx iOS 构建-'))
  roots.push(root)
  return path.join(root, 'target.json')
}

it('Shutdown 真实库存只能生成构建目标，不能生成运行设备或选择其他目标', () => {
  expect(target()).toMatchObject({ id: 'selected', state: 'Shutdown', runtime: 'runtime-selected' })
  expect(() => selectIosDevice(inventory(), env)).toThrow('指定设备不可用')
  for (const output of [inventory('Booted'), inventory('Creating'), inventory('Shutdown', 'runtime', false)]) {
    expect(() => selectIosBuildTarget(output, env)).toThrow('指定设备不可用')
  }
  expect(() => selectIosBuildTarget(inventory(), {})).toThrow('显式')
})

it('重复 UDID 不因另一条 unavailable 库存被过滤而隐藏', () => {
  const output = JSON.stringify({ devices: {
    first: [{ udid: 'selected', name: '设备', state: 'Shutdown', isAvailable: true }],
    second: [{ udid: 'selected', name: '冲突设备', state: 'Shutdown', isAvailable: false }],
  } })
  expect(() => selectIosBuildTarget(output, env)).toThrow('重复身份')
})

it('运行阶段显式 destination 改变时在构建前阻断，不静默覆盖请求', async () => {
  const build = vi.fn()
  const run = vi.fn()
  await expect(withBuiltIosDevice(target(), path.resolve('host'), path.resolve('artifact'), build, run, {
    ...env,
    LYNX_IOS_DESTINATION: 'platform=iOS Simulator,id=selected,arch=arm64',
  })).rejects.toThrow('destination')
  expect(build).not.toHaveBeenCalled()
  expect(run).not.toHaveBeenCalled()
  expect(invoke).not.toHaveBeenCalled()
})

it('先完成真实构建，才验证同一设备的运行就绪并执行安装启动阶段', async () => {
  const events: string[] = []
  let finish!: () => void
  const building = new Promise<void>(resolve => finish = resolve)
  invoke.mockImplementation(async (_file, args) => {
    events.push(args[1]!)
    return args[1] === 'list' ? inventory('Booted') : ''
  })
  const running = withBuiltIosDevice(target(), path.resolve('host'), path.resolve('artifact'), async () => {
    events.push('build')
    await building
  }, async (device) => {
    events.push('install-launch')
    expect(device.state).toBe('Booted')
    return 'report'
  }, env)
  expect(events).toEqual(['build'])
  finish()
  await expect(running).resolves.toMatchObject({ result: 'report', device: { id: 'selected', runtime: 'runtime-selected', state: 'Booted' } })
  expect(events).toEqual(['build', 'bootstatus', 'list', 'install-launch'])
  expect(invoke.mock.calls[0]?.[1]).toEqual(['simctl', 'bootstatus', 'selected', '-b'])
  expect(invoke.mock.calls.map(call => call[3])).toEqual([120_000, 30_000])
})

it('构建失败时不查询运行就绪、不安装启动；就绪失败不重试或运行', async () => {
  const run = vi.fn()
  const failure = new Error('build failed')
  await expect(withBuiltIosDevice(target(), path.resolve('host'), path.resolve('artifact'), async () => {
    throw failure
  }, run, env)).rejects.toBe(failure)
  expect(invoke).not.toHaveBeenCalled()
  expect(run).not.toHaveBeenCalled()
  invoke.mockResolvedValueOnce('').mockRejectedValueOnce(new Error('list timed out'))
  await expect(withBuiltIosDevice(target(), path.resolve('host'), path.resolve('artifact'), async () => {}, run, env)).rejects.toThrow('list timed out')
  expect(invoke).toHaveBeenCalledTimes(2)
  expect(run).not.toHaveBeenCalled()
})

it('CI 自建目标启动失败时不查询在线设备、不进入安装启动，不重试', async () => {
  const run = vi.fn()
  invoke.mockRejectedValueOnce(new Error('bootstatus timed out'))
  await expect(withBuiltIosDevice(target(), path.resolve('host'), path.resolve('artifact'), async () => {}, run, env)).rejects.toThrow('bootstatus timed out')
  expect(invoke).toHaveBeenCalledExactlyOnceWith('xcrun', ['simctl', 'bootstatus', 'selected', '-b'], path.resolve('host'), 120_000, {
    file: path.resolve('artifact', 'boot-readiness-command.json'),
  })
  expect(run).not.toHaveBeenCalled()
})

it.each([['Shutdown', 'runtime-selected', true], ['Booted', 'changed-runtime', true], ['Booted', 'runtime-selected', false]])('构建后状态/runtime/available 改变（%s/%s/%s）即阻断安装', async (state, runtime, available) => {
  invoke.mockResolvedValueOnce('').mockResolvedValueOnce(inventory(state as string, runtime as string, available as boolean))
  const run = vi.fn()
  await expect(withBuiltIosDevice(target(), path.resolve('host'), path.resolve('artifact'), async () => {}, run, env)).rejects.toThrow()
  expect(run).not.toHaveBeenCalled()
})

it('准备文件来自启动前的精确查询，并绑定本轮执行与真实 checkout', async () => {
  const file = await manifestFile()
  invoke.mockResolvedValueOnce(sha).mockResolvedValueOnce(inventory()).mockResolvedValueOnce(sha)
  await expect(prepareIosBuildTarget(path.resolve('host'), file, env)).resolves.toEqual(target())
  await expect(readPreparedIosBuildTarget(path.resolve('host'), { ...env, LYNX_IOS_BUILD_TARGET_FILE: file })).resolves.toEqual(target())
  expect(invoke.mock.calls[1]).toEqual(['xcrun', ['simctl', 'list', 'devices', 'selected', '--json'], path.resolve('host'), 30_000, { file: path.join(path.dirname(file), 'device-discovery-command.json') }])
  expect(JSON.parse(await fs.readFile(file, 'utf8'))).toMatchObject({ schemaVersion: 1, runId: '123', runAttempt: '1', sha })
})

it.each(['runId', 'runAttempt', 'sha', 'schemaVersion', 'inventory'])('准备文件的 %s 过时或无效时拒绝回退发现', async (key) => {
  const file = await manifestFile()
  const manifest = { schemaVersion: 1, runId: '123', runAttempt: '1', sha, inventory: inventory(), target: target(), [key]: 'invalid' }
  await fs.writeFile(file, JSON.stringify(manifest))
  invoke.mockResolvedValue(sha)
  await expect(readPreparedIosBuildTarget(path.resolve('host'), { ...env, LYNX_IOS_BUILD_TARGET_FILE: file })).rejects.toThrow()
  expect(invoke.mock.calls.every(call => call[0] === 'git')).toBe(true)
})

it('本地默认无准备文件不执行命令；本地借用设备不能消费 hosted 准备文件', async () => {
  await expect(readPreparedIosBuildTarget(path.resolve('host'), {})).resolves.toBeUndefined()
  await expect(readPreparedIosBuildTarget(path.resolve('host'), { LYNX_IOS_BUILD_TARGET_FILE: 'target.json' })).rejects.toThrow('hosted')
  expect(invoke).not.toHaveBeenCalled()
})

it('本地借用设备只等待已有启动，不通过 -b 自动启动已关闭的目标', async () => {
  invoke.mockResolvedValueOnce('').mockResolvedValueOnce(inventory('Booted'))
  await withBuiltIosDevice(selectIosDevice(inventory('Booted'), env), path.resolve('host'), path.resolve('artifact'), async () => {}, async () => {}, {})
  expect(invoke.mock.calls[0]?.[1]).toEqual(['simctl', 'bootstatus', 'selected'])
  expect(invoke.mock.calls.some(call => call[1].includes('boot') || call[1].includes('create'))).toBe(false)
})

it.each(['timeout', 'missing', 'partial', 'duplicate'])('启动前 %s 库存不生成准备文件', async (kind) => {
  const file = await manifestFile()
  const outputs = {
    missing: JSON.stringify({ devices: { runtime: [{ udid: 'selected-extra', state: 'Shutdown', isAvailable: true }] } }),
    partial: JSON.stringify({ devices: { runtime: [{ udid: 'selected', state: 'Shutdown' }] } }),
    duplicate: JSON.stringify({ devices: { runtime: [
      { udid: 'selected', state: 'Shutdown', isAvailable: true },
      { udid: 'selected', state: 'Shutdown', isAvailable: true },
    ] } }),
  }
  invoke.mockResolvedValueOnce(sha)
  if (kind === 'timeout') {
    invoke.mockRejectedValueOnce(new Error('query timeout'))
  }
  else {
    invoke.mockResolvedValueOnce(outputs[kind as keyof typeof outputs])
  }
  await expect(prepareIosBuildTarget(path.resolve('host'), file, env)).rejects.toThrow()
  await expect(fs.stat(file)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(invoke).toHaveBeenCalledTimes(2)
})

it('准备文件不能覆盖已存在证据，损坏 JSON 与更换目标不能回退', async () => {
  const file = await manifestFile()
  await fs.writeFile(file, 'original')
  invoke.mockResolvedValueOnce(sha).mockResolvedValueOnce(inventory())
  await expect(prepareIosBuildTarget(path.resolve('host'), file, env)).rejects.toMatchObject({ code: 'EEXIST' })
  expect(await fs.readFile(file, 'utf8')).toBe('original')
  await expect(readPreparedIosBuildTarget(path.resolve('host'), { ...env, LYNX_IOS_BUILD_TARGET_FILE: file })).rejects.toThrow()
  await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, runId: '123', runAttempt: '1', sha, inventory: inventory(), target: target() }))
  invoke.mockResolvedValue(sha)
  await expect(readPreparedIosBuildTarget(path.resolve('host'), { ...env, LYNX_IOS_BUILD_TARGET_FILE: file, LYNX_IOS_DEVICE_ID: 'other' })).rejects.toThrow()
  await expect(readPreparedIosBuildTarget(path.resolve('host'), { ...env, LYNX_IOS_BUILD_TARGET_FILE: file, LYNX_IOS_DESTINATION: 'platform=iOS Simulator,id=selected,arch=arm64' })).rejects.toThrow('destination')
})

it.each(['build', 'readiness'])('原生 runner 的 %s 失败保留阶段，且绝不执行 install/launch', async (failureStage) => {
  vi.stubEnv('LYNX_IOS_SKIP_PROJECT_GENERATION', '')
  vi.stubEnv('LYNX_IOS_SKIP_POD_INSTALL', '')
  vi.stubEnv('LYNX_IOS_DEVICE_ID', 'selected')
  vi.stubEnv('LYNX_IOS_DESTINATION', undefined)
  const events: string[] = []
  invoke.mockImplementation(async (file, args) => {
    events.push(file === 'xcrun' ? args[1]! : file)
    if (file === 'xcodebuild' && failureStage === 'build') {
      throw new Error('native build failed')
    }
    if (args[1] === 'list') {
      throw new Error('query timed out')
    }
    return ''
  })
  const setStage = vi.fn()
  const options = { platform: 'ios' as const, bundlePath: undefined, captureOnly: false, outputDir: undefined, captureDurationSeconds: 15 }
  await expect(runIos(path.resolve('host'), path.resolve('artifact'), selectIosDevice(inventory('Booted'), env), {} as never, options, setStage)).rejects.toThrow()
  expect(events).toEqual(failureStage === 'build' ? ['xcodegen', 'pod', 'xcodebuild'] : ['xcodegen', 'pod', 'xcodebuild', 'bootstatus', 'list'])
  expect(setStage).toHaveBeenLastCalledWith(failureStage === 'build' ? 'native-build' : 'device-readiness')
})
