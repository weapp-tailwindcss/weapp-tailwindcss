import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { sampleProcessTreeAsync } from '../scripts/demo-e2e-memory'

const command = vi.hoisted(() => vi.fn())
vi.mock('../scripts/demo-e2e-workflow/process-command', () => ({ runProcessCommand: command }))
const platform = process.platform
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  command.mockReset()
})

it('POSIX 异步采样保留子树汇总与带空格命令，排除无关进程', async () => {
  Object.defineProperty(process, 'platform', { value: 'linux' })
  command.mockResolvedValue([
    '100 1 1024 node parent.js',
    '200 100 2048 node child worker.js',
    '300 200 3072 node grandchild.js',
    '400 1 999999 unrelated',
  ].join('\r\n'))
  expect(await sampleProcessTreeAsync(100)).toMatchObject({
    rssMb: 6,
    maxProcessRssMb: 3,
    processCount: 3,
    topProcesses: [
      { pid: 300, ppid: 200, rssMb: 3, command: 'node grandchild.js' },
      { pid: 200, ppid: 100, rssMb: 2, command: 'node child worker.js' },
      { pid: 100, ppid: 1, rssMb: 1, command: 'node parent.js' },
    ],
  })
  expect(command.mock.calls[0]?.[2]).toBe(5000)
})

it('Windows 异步采样保留既有 PowerShell 范围和结构化结果', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32' })
  command.mockResolvedValue(JSON.stringify({ rssMb: 12, maxProcessRssMb: 10, processCount: 2, topProcesses: [] }))
  expect(await sampleProcessTreeAsync(42)).toMatchObject({ rssMb: 12, maxProcessRssMb: 10, processCount: 2 })
  expect(command.mock.calls[0]?.[0]).toBe('powershell')
  expect(command.mock.calls[0]?.[1][2]).toContain('$root = [int]42')
  expect(command.mock.calls[0]?.[1][2]).toContain('$command.Contains($repositoryRoot)')
  expect(command.mock.calls[0]?.[2]).toBe(5000)
  command.mockResolvedValue('{}')
  await expect(sampleProcessTreeAsync(42)).rejects.toThrow('响应无效')
})

it('异步采样故障向上传递，不伪装成没有样本', async () => {
  command.mockRejectedValue(new Error('probe timed out'))
  await expect(sampleProcessTreeAsync(42)).rejects.toThrow('probe timed out')
})
