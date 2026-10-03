import type { SpawnSyncReturns } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { beforeEach, expect, it, vi } from 'vitest'
import { findRunningHBuilderXCliCandidates } from '../src/hbuilderx/discovery'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('../src/fs', () => ({ fileExists: vi.fn(async () => true) }))

beforeEach(() => vi.resetAllMocks())

function processOutput(paths: string[]) {
  return ['WT-HBUILDERX-PROCESSES/1', ...paths.map(value => Buffer.from(value).toString('base64')), 'END', ''].join('\r\n')
}

function processResult(overrides: Partial<SpawnSyncReturns<string>> = {}): SpawnSyncReturns<string> {
  const result = { pid: 1234, status: 0, signal: null, stdout: '', stderr: '', ...overrides }
  return { ...result, output: [null, result.stdout, result.stderr] }
}

it('在没有 WMIC 的 Windows 上识别现有 IDE，保留中文、逗号与共享根目录', async () => {
  vi.mocked(spawnSync).mockImplementation((command) => {
    if (command !== 'powershell.exe') {
      return processResult({ error: new Error('ENOENT'), status: null })
    }
    return processResult({
      status: 0,
      stdout: processOutput(['C:\\中文, 空格 & IDE\\HBuilderX.exe', '\\\\server\\share\\HBuilderX.exe']),
      stderr: '',
    })
  })
  await expect(findRunningHBuilderXCliCandidates('win32')).resolves.toEqual([
    'C:\\中文, 空格 & IDE\\cli.exe',
    '\\\\server\\share\\cli.exe',
  ])
})

it('进程探测失败不能伪装成没有运行实例', async () => {
  vi.mocked(spawnSync).mockReturnValue(processResult({ status: 1, stderr: 'CIM access denied' }))
  await expect(findRunningHBuilderXCliCandidates('win32')).rejects.toThrow('CIM access denied')
})

it('有效的空实例列表不报错', async () => {
  vi.mocked(spawnSync).mockReturnValue(processResult({ stdout: `\uFEFF${processOutput([])}` }))
  await expect(findRunningHBuilderXCliCandidates('win32')).resolves.toEqual([])
})

it.each(['not-json', 'null', '{"path":"C:/HBuilderX.exe"}'])('拒绝把损坏的探测结果当作没有实例：%s', async (stdout) => {
  vi.mocked(spawnSync).mockReturnValue(processResult({ stdout }))
  await expect(findRunningHBuilderXCliCandidates('win32')).rejects.toThrow()
})

it.each(['darwin', 'linux'] as const)('%s 保留系统进程查询与 POSIX 路径', async (platform) => {
  vi.mocked(spawnSync).mockImplementation(command => processResult({
    status: command === 'ps' ? 0 : 1,
    stdout: '/Applications/HBuilderX.app/Contents/MacOS/HBuilderX --argument\n',
  }))
  await expect(findRunningHBuilderXCliCandidates(platform)).resolves.toEqual(['/Applications/HBuilderX.app/Contents/MacOS/cli'])
})

it.each([
  'WT-HBUILDERX-PROCESSES/1\n',
  'WT-HBUILDERX-PROCESSES/1\nnot-base64\nEND',
  processOutput(['relative\\HBuilderX.exe']),
  processOutput(['C:HBuilderX.exe']),
  processOutput(['\\HBuilderX.exe']),
  processOutput(['C:\\IDE\\other.exe']),
])('拒绝截断、损坏或不属于 IDE 的进程路径：%s', async (stdout) => {
  vi.mocked(spawnSync).mockReturnValue(processResult({ stdout }))
  await expect(findRunningHBuilderXCliCandidates('win32')).rejects.toThrow()
})

it('超时保留阶段日志、信号和底层错误，仍然拒绝探测', async () => {
  vi.mocked(spawnSync).mockReturnValue(processResult({
    status: null,
    signal: 'SIGTERM',
    error: Object.assign(new Error('spawnSync powershell.exe ETIMEDOUT'), { code: 'ETIMEDOUT' }),
    stdout: '',
    stderr: 'process-discovery: querying',
  }))
  await expect(findRunningHBuilderXCliCandidates('win32')).rejects.toThrow(/signal=SIGTERM[\s\S]*ETIMEDOUT[\s\S]*process-discovery: querying/)
  expect(vi.mocked(spawnSync)).toHaveBeenCalledTimes(3)
})

it('Windows 探测超时时重试，成功后不再报错', async () => {
  vi.mocked(spawnSync)
    .mockReturnValueOnce(processResult({
      status: null,
      signal: 'SIGTERM',
      error: Object.assign(new Error('spawnSync powershell.exe ETIMEDOUT'), { code: 'ETIMEDOUT' }),
      stdout: '',
      stderr: 'process-discovery: querying',
    }))
    .mockReturnValueOnce(processResult({
      status: 0,
      stdout: processOutput(['C:\\中文, 空格 & IDE\\HBuilderX.exe']),
      stderr: 'process-discovery: complete',
    }))
  await expect(findRunningHBuilderXCliCandidates('win32')).resolves.toEqual([
    'C:\\中文, 空格 & IDE\\cli.exe',
  ])
  expect(vi.mocked(spawnSync)).toHaveBeenCalledTimes(2)
})

it('识别盘符根目录中的 IDE', async () => {
  vi.mocked(spawnSync).mockReturnValue(processResult({ stdout: processOutput(['C:\\HBuilderX.exe']) }))
  await expect(findRunningHBuilderXCliCandidates('win32')).resolves.toEqual(['C:\\cli.exe'])
})
