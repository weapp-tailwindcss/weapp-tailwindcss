import type { HBuilderXCommandOptions } from '../src/types'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { beforeEach, expect, it, vi } from 'vitest'
import { fileExists } from '../src/fs'
import { resolveHBuilderXCli, resolveHBuilderXCliInfo } from '../src/hbuilderx'
import { createHBuilderXRunner } from '../src/hbuilderx/runner'
import { runCommand } from '../src/process'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => {
    throw new Error('进程枚举不可用')
  }),
}))
vi.mock('../src/fs', () => ({ fileExists: vi.fn(async () => true), wait: vi.fn(async () => {}) }))
vi.mock('../src/process', async importOriginal => ({ ...await importOriginal<typeof import('../src/process')>(), runCommand: vi.fn() }))

const cli = 'configured-cli'
let hosts: string[]
let version: string
let onCommand: ((options: HBuilderXCommandOptions) => { code?: number | null, output?: string, kind?: 'timeout' | 'unknown' }) | undefined

beforeEach(() => {
  vi.clearAllMocks()
  hosts = ['host-a']
  version = '5.24.2026081301'
  onCommand = undefined
  vi.mocked(fileExists).mockResolvedValue(true)
  vi.mocked(runCommand).mockImplementation(async (options) => {
    const override = onCommand?.(options)
    const output = override?.output ?? (options.args[0] === 'listhost' ? hosts.join('\n') : options.args[0] === 'version' ? version : '')
    return { ...options, exit: { code: override && 'code' in override ? override.code! : 0, signal: null }, logs: [output], output, issue: { kind: override?.kind ?? 'unknown', message: '' } }
  })
})

it.each(['candidate', 'env'] as const)('显式 %s 通过 host 连接，不依赖进程枚举或重复 open', async (source) => {
  const runner = await createHBuilderXRunner(source === 'candidate'
    ? { candidates: [cli], env: { HBUILDERX_CLI_PATH: undefined } }
    : { env: { HBUILDERX_CLI_PATH: cli } })
  expect(runner.resolution).toMatchObject({ path: cli, isRunning: true, host: 'host-a', source })
  expect(spawnSync).not.toHaveBeenCalled()
  expect(vi.mocked(runCommand).mock.calls.map(([options]) => options.args)).toEqual([['listhost'], ['version', '--host', 'host-a']])
})

it('显式设置的进程环境仍能绑定 CLI、channel 和 host', async () => {
  vi.stubEnv('HBUILDERX_CLI_PATH', 'environment-cli')
  vi.stubEnv('HBUILDERX_CHANNEL', 'alpha')
  vi.stubEnv('HBUILDERX_HOST', 'host-b')
  hosts.push('host-b')
  version += '-alpha'

  const runner = await createHBuilderXRunner()
  expect(runner.resolution).toMatchObject({
    path: 'environment-cli',
    channel: 'alpha',
    host: 'host-b',
    source: 'env',
  })
  expect(vi.mocked(runCommand).mock.calls.map(([options]) => options.args)).toEqual([
    ['listhost'],
    ['version', '--host', 'host-b'],
  ])
  expect(spawnSync).not.toHaveBeenCalled()
})

it('显式实例选项优先于进程环境，环境不跨测试保留', async () => {
  expect(process.env['HBUILDERX_HOST']).toBeUndefined()
  expect(process.env['HBUILDERX_CHANNEL']).toBeUndefined()
  expect(process.env['HBUILDERX_CLI_PATH']).toBeUndefined()
  vi.stubEnv('HBUILDERX_CLI_PATH', 'other-cli')
  vi.stubEnv('HBUILDERX_CHANNEL', 'alpha')
  vi.stubEnv('HBUILDERX_HOST', 'other-host')

  const runner = await createHBuilderXRunner({ hbuilderxCliPath: cli, channel: 'stable', host: 'host-a' })
  expect(runner.resolution).toMatchObject({ path: cli, channel: 'stable', host: 'host-a', source: 'candidate' })
  expect(spawnSync).not.toHaveBeenCalled()
})

it('只有确认没有 host 时才 open 一次，并等待实例注册', async () => {
  hosts = []
  let opened = false
  let polls = 0
  onCommand = ({ args }) => {
    if (args[0] === 'open') {
      opened = true
    }
    if (opened && args[0] === 'listhost' && ++polls === 2) {
      hosts = ['host-a']
    }
    return {}
  }
  await expect(createHBuilderXRunner({ hbuilderxCliPath: cli })).resolves.toMatchObject({ resolution: { host: 'host-a' } })
  expect(vi.mocked(runCommand).mock.calls.filter(([options]) => options.args[0] === 'open')).toHaveLength(1)
})

it.each(['mismatch', 'ambiguous', 'timeout', 'failed', 'invalid-version'] as const)('拒绝把 %s 当作不存在的 IDE 再次 open', async (scenario) => {
  if (scenario === 'mismatch') {
    version += '-alpha'
  }
  if (scenario === 'ambiguous') {
    hosts.push('host-b')
  }
  if (scenario === 'invalid-version') {
    version = 'unavailable'
  }
  if (scenario === 'timeout' || scenario === 'failed') {
    onCommand = () => ({ code: scenario === 'timeout' ? null : 1, kind: scenario === 'timeout' ? 'timeout' : 'unknown' })
  }
  await expect(createHBuilderXRunner({ hbuilderxCliPath: cli, channel: 'stable' })).rejects.toThrow()
  expect(vi.mocked(runCommand).mock.calls.some(([options]) => options.args[0] === 'open')).toBe(false)
})

it('显式 host 消除歧义，并让后续命令固定绑定该实例', async () => {
  hosts.push('host-b')
  const runner = await createHBuilderXRunner({ hbuilderxCliPath: cli, host: 'host-b' })
  await runner.run({ args: ['project', 'list'] })
  expect(vi.mocked(runCommand).mock.lastCall?.[0].args).toEqual(['project', 'list', '--host', 'host-b'])
})

it('显式 candidate 优先于环境变量，缺失时不回退到其他安装', async () => {
  const runner = await createHBuilderXRunner({ candidates: [cli], env: { HBUILDERX_CLI_PATH: 'other-cli' } })
  expect(runner.resolution.path).toBe(cli)
  vi.mocked(fileExists).mockResolvedValue(false)
  await expect(createHBuilderXRunner({ candidates: [cli] })).rejects.toThrow('candidate')
  expect(spawnSync).not.toHaveBeenCalled()
})

it('所有 host 命令共享启动截止时间', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1020).mockReturnValueOnce(1040)
  try {
    await createHBuilderXRunner({ hbuilderxCliPath: cli, timeoutMs: 100 })
    expect(vi.mocked(runCommand).mock.calls.map(([options]) => options.timeoutMs)).toEqual([80, 60])
  }
  finally {
    now.mockRestore()
  }
})

it('识别原生 CLI 的未启动响应，但不把同文本的超时当作确认', async () => {
  let opened = false
  onCommand = ({ args }) => {
    if (args[0] === 'open') {
      opened = true
    }
    return opened ? {} : { code: 1, output: 'HBuilderX is not detected running. Please execute cli open to start HBuilderX and try again' }
  }
  await expect(createHBuilderXRunner({ hbuilderxCliPath: cli })).resolves.toMatchObject({ resolution: { host: 'host-a' } })
  vi.mocked(runCommand).mockClear()
  onCommand = () => ({ code: null, kind: 'timeout', output: 'HBuilderX is not detected running. Please execute cli open to start HBuilderX and try again' })
  await expect(createHBuilderXRunner({ hbuilderxCliPath: cli })).rejects.toMatchObject({ result: { issue: { kind: 'timeout' } } })
  expect(vi.mocked(runCommand).mock.calls.some(([options]) => options.args[0] === 'open')).toBe(false)
})

it('启动期限耗尽后不再发命令，保留标准 timeout 分类', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1100)
  try {
    await expect(createHBuilderXRunner({ hbuilderxCliPath: cli, timeoutMs: 100 })).rejects.toMatchObject({ result: { issue: { kind: 'timeout' } } })
    expect(runCommand).not.toHaveBeenCalled()
  }
  finally {
    now.mockRestore()
  }
})

it('IDE 启动后 host 始终未注册时保留超时分类', async () => {
  hosts = []
  const now = vi.spyOn(Date, 'now')
    .mockReturnValueOnce(1000)
    .mockReturnValueOnce(1020)
    .mockReturnValueOnce(1040)
    .mockReturnValueOnce(1060)
    .mockReturnValueOnce(1080)
    .mockReturnValue(1100)
  try {
    await expect(createHBuilderXRunner({ hbuilderxCliPath: cli, timeoutMs: 100 })).rejects.toMatchObject({ result: { issue: { kind: 'timeout' } } })
    expect(vi.mocked(runCommand).mock.calls.map(([options]) => options.args)).toEqual([['listhost'], ['open'], ['listhost']])
  }
  finally {
    now.mockRestore()
  }
})

it.each(['candidate', 'env'] as const)('解析显式 %s 路径不依赖操作系统进程枚举', async (source) => {
  await expect(resolveHBuilderXCli(source === 'candidate'
    ? { candidates: [cli], env: {} }
    : { env: { HBUILDERX_CLI_PATH: cli } })).resolves.toBe(cli)
  expect(spawnSync).not.toHaveBeenCalled()
  expect(runCommand).not.toHaveBeenCalled()
})

it.each(['win32', 'darwin', 'linux'] as const)('%s 信息查询 API 保留真实运行状态语义，纯路径 API 仍校验 channel', async (platform) => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { value: platform })
  try {
    vi.mocked(spawnSync).mockReturnValueOnce({ status: 0, stdout: platform === 'win32' ? 'WT-HBUILDERX-PROCESSES/1\r\n\r\nEND\r\n' : '', stderr: '' } as ReturnType<typeof spawnSync>)
    await expect(resolveHBuilderXCliInfo({ candidates: [cli], channel: 'alpha', env: { HBUILDERX_CLI_PATH: cli } })).resolves.toMatchObject({ path: cli, isRunning: false, source: 'env', channel: 'unknown' })
    expect(spawnSync).toHaveBeenCalledOnce()
    await expect(resolveHBuilderXCli({ candidates: [cli], env: { HBUILDERX_CHANNEL: 'invalid' } })).rejects.toThrow('channel')
  }
  finally {
    Object.defineProperty(process, 'platform', descriptor)
  }
})

const stoppedDiagnostics = [
  '没有可用的命令，尝试使用 cli open',
  '没有可用的命令，尝试使用 cli open\n未检测到已打开的HBuilderX，请先执行cli open启动HBuilderX后再重试',
  '未检测到已打开的HBuilderX，请先执行cli open启动HBuilderX后再重试',
] as const

it.each(stoppedDiagnostics)('识别中文未启动响应并启动目标 IDE：%s', async (output) => {
  let opened = false
  onCommand = ({ args }) => {
    if (args[0] === 'open') {
      opened = true
    }
    return opened ? {} : { code: 1, output }
  }
  await expect(createHBuilderXRunner({ hbuilderxCliPath: cli })).resolves.toMatchObject({ resolution: { host: 'host-a' } })
  expect(vi.mocked(runCommand).mock.calls.map(([options]) => options.args)).toEqual([
    ['listhost'],
    ['open'],
    ['listhost'],
    ['version', '--host', 'host-a'],
  ])
})

it('中文未启动提示不能覆盖命令超时', async () => {
  onCommand = () => ({ code: null, kind: 'timeout', output: stoppedDiagnostics[0] })
  await expect(createHBuilderXRunner({ hbuilderxCliPath: cli })).rejects.toMatchObject({ result: { issue: { kind: 'timeout' } } })
  expect(vi.mocked(runCommand).mock.calls.some(([options]) => options.args[0] === 'open')).toBe(false)
})

it('超时 CLI 即使在清理时以零退出码结束，也不能被接纳为有效 host 响应', async () => {
  onCommand = () => ({ code: 0, kind: 'timeout', output: 'host-a' })
  await expect(createHBuilderXRunner({ hbuilderxCliPath: cli })).rejects.toMatchObject({ result: { issue: { kind: 'timeout' } } })
  expect(vi.mocked(runCommand).mock.calls.map(([options]) => options.args)).toEqual([['listhost']])
})
