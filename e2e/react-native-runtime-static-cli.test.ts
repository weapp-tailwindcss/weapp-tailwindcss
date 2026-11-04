import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'

const { prepareRuntimeStaticEvidence } = vi.hoisted(() => ({ prepareRuntimeStaticEvidence: vi.fn() }))
vi.mock('./react-native/runtime-static', () => ({ prepareRuntimeStaticEvidence }))
const argv = process.argv
const directories: string[] = []

afterEach(async () => {
  process.argv = argv
  vi.resetAllMocks()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function staticSession(overrides: Record<string, unknown> = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rn-startup-cli-'))
  directories.push(directory)
  await writeFile(path.join(directory, 'runtime-session.json'), JSON.stringify({ version: 1, producer: 'react-native', target: 'react-native-ios', runId: 'run', invocationId: 'invocation', ...overrides }))
  process.argv = [process.execPath, 'runtime-static-cli.ts', directory, 'run', 'invocation']
  vi.resetModules()
  return directory
}

it('static CLI 只接受与父进程相同的本轮 iOS 身份', async () => {
  const directory = await staticSession()
  await import('./react-native/runtime-static-cli')
  expect(prepareRuntimeStaticEvidence).toHaveBeenCalledWith(directory)
})

it.each([
  { version: 2 },
  { producer: 'expo-web' },
  { target: 'react-native-android' },
  { runId: 'foreign-run' },
  { invocationId: 'foreign-invocation' },
])('static CLI 拒绝外来身份 %j，且不启动生成', async (overrides) => {
  await staticSession(overrides)
  await expect(import('./react-native/runtime-static-cli')).rejects.toThrow('身份不符')
  expect(prepareRuntimeStaticEvidence).not.toHaveBeenCalled()
})

it('static CLI 拒绝相对目录及多余参数', async () => {
  const directory = await staticSession()
  process.argv[2] = 'relative-artifacts'
  await expect(import('./react-native/runtime-static-cli')).rejects.toThrow('绝对证据目录')
  vi.resetModules()
  process.argv[2] = directory
  process.argv.push('extra')
  await expect(import('./react-native/runtime-static-cli')).rejects.toThrow('用法')
  expect(prepareRuntimeStaticEvidence).not.toHaveBeenCalled()
})
