import type { StageBinding } from './tailwind-capabilities/stage-receipt'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { runExternalTarget } from './tailwind-capabilities/external'

const mocks = vi.hoisted(() => ({ binding: undefined as StageBinding | undefined, adapter: vi.fn(), stale: false }))
vi.mock('execa', () => ({ execa: async (_file: string, _args: string[], options: { cwd: string, env: Record<string, string> }) => {
  const binding = mocks.binding = JSON.parse(options.env['TAILWIND_E2E_STAGE_BINDING']!) as StageBinding
  const source = path.join(options.cwd, 'e2e', '.artifacts', 'react-native-ios')
  await mkdir(source, { recursive: true })
  const { file, ...identity } = binding
  await writeFile(path.join(source, 'runtime-session.json'), JSON.stringify({ ...identity, ...(mocks.stale ? { invocationId: 'old-call' } : {}) }))
  await writeFile(path.join(source, 'expo-run.log'), 'original CocoaPods startup error')
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ ...binding, status: 'failed', diagnostic: 'pod install failed' }))
  return { exitCode: 1 }
} }))
vi.mock('./tailwind-capabilities/native-adapter', () => ({ buildNativeCapabilityReport: async (...args: unknown[]) => {
  mocks.adapter(...args)
  return { report: {} }
} }))
vi.mock('./tailwind-capabilities/report', () => ({ assertCapabilitySuccess: () => {} }))

const directories: string[] = []
afterEach(async () => {
  vi.clearAllMocks()
  mocks.stale = false
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
it('同run旧调用的诊断不能归档，既有报告也不能冒充本次产物', async () => {
  mocks.stale = true
  const root = await mkdtemp(path.join(tmpdir(), 'tailwind-native-archive-'))
  directories.push(root)
  const directory = path.join(root, 'run', 'react-native-ios')
  await mkdir(path.join(directory, 'native'), { recursive: true })
  await writeFile(path.join(directory, 'native', 'report.json'), JSON.stringify({ runId: 'startup-failed', stale: true }))
  const context = { root, directory, runId: 'startup-failed', env: {} }
  await expect(runExternalTarget('react-native-ios', context)).rejects.toThrow()
  expect(mocks.adapter).toHaveBeenCalledWith(context, 'react-native-ios', undefined, expect.any(AggregateError))
})
it('生产外部调度先归档本次诊断再读取可选报告，启动前失败也不丢原始日志', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tailwind-native-archive-'))
  directories.push(root)
  const directory = path.join(root, 'run', 'react-native-ios')
  const context = { root, directory, runId: 'startup-failed', env: {} }
  await expect(runExternalTarget('react-native-ios', context)).rejects.toThrow('子进程与本轮证据读取同时失败')
  expect(await readFile(path.join(directory, 'native', 'expo-run.log'), 'utf8')).toBe('original CocoaPods startup error')
  const identity = JSON.parse(await readFile(path.join(directory, 'native', 'runtime-session.json'), 'utf8'))
  expect(identity.invocationId).toBe(mocks.binding!.invocationId)
  expect(mocks.adapter).toHaveBeenCalledWith(context, 'react-native-ios', undefined, expect.any(AggregateError))
})
