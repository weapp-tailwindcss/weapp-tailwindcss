import type { NativeEvidenceContext } from '../examples/react-lynx/src/compatibility/types'
import type { IosBuildTarget } from './lynx/native-device'
import type { NativeRunOptions } from './lynx/native-options'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { resolveIosAppContainer } from './lynx/ios-container'
import { command } from './lynx/native-command'
import { runIos } from './lynx/run-ios'

vi.mock('./lynx/evidence', () => ({ collectNativeEvidence: vi.fn() }))
vi.mock('./lynx/native-command', () => ({ command: vi.fn() }))
vi.mock('./lynx/ios-container', () => ({ resolveIosAppContainer: vi.fn() }))
vi.mock('./lynx/ios-build-target', () => ({
  withBuiltIosDevice: vi.fn(async (_target: unknown, _host: unknown, _artifacts: unknown, build: () => Promise<void>, run: (device: { id: string }) => Promise<unknown>) => {
    await build()
    return run({ id: 'bound-device' })
  }),
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.mocked(command).mockReset()
  vi.mocked(resolveIosAppContainer).mockReset()
})

function fixture() {
  vi.stubEnv('LYNX_IOS_SKIP_PROJECT_GENERATION', '')
  vi.stubEnv('LYNX_IOS_SKIP_POD_INSTALL', '')
  vi.spyOn(fs, 'writeFile').mockResolvedValue()
  const host = path.join(os.tmpdir(), 'lynx host with spaces')
  const artifacts = path.join(os.tmpdir(), 'lynx artifacts with spaces')
  const target = { destination: 'id=bound-device', state: 'Booted' } as IosBuildTarget
  const context = { runId: 'current-run' } as NativeEvidenceContext
  const options = {} as NativeRunOptions
  return { host, artifacts, target, context, options }
}

it('真实 runIos 安装调用保留120秒与指定设备，并绑定独立诊断；原错误立即阻断后续阶段', async () => {
  const input = fixture()
  const primary = new Error('install exceeded original 120000ms')
  vi.mocked(command).mockImplementation(async (_name, args) => {
    if (args[1] === 'install') {
      throw primary
    }
    return ''
  })
  const stage = vi.fn()
  await expect(runIos(input.host, input.artifacts, input.target, input.context, input.options, stage)).rejects.toBe(primary)
  expect(command).toHaveBeenLastCalledWith('xcrun', [
    'simctl',
    'install',
    'bound-device',
    path.join(input.host, 'DerivedData', 'Build', 'Products', 'Debug-iphonesimulator', 'LynxCompatibilityHost.app'),
  ], input.host, 120_000, { file: path.join(input.artifacts, 'install-command.json') })
  expect(resolveIosAppContainer).not.toHaveBeenCalled()
  expect(vi.mocked(command).mock.calls.some(([, args]) => args[1] === 'launch')).toBe(false)
  expect(stage).toHaveBeenCalledWith('native-run')
})
