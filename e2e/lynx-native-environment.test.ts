import type { NativePlatformReport } from '../examples/react-lynx/src/compatibility/types'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { command } from './lynx/native-command'
import { selectAndroidDevice, selectIosDevice } from './lynx/native-device'
import { enrichEnvironment } from './lynx/native-environment'
import baseline from './lynx/reports/ios.json'

vi.mock('./lynx/native-command', () => ({ command: vi.fn() }))

const run = vi.mocked(command)
beforeEach(() => vi.resetAllMocks())

describe('Lynx 报告沿用运行设备身份', () => {
  it('多台 iOS 同时 Booted 时，元数据来自已选设备且不再重新枚举', async () => {
    const device = selectIosDevice(JSON.stringify({ devices: {
      'runtime-first': [{ udid: 'first', name: '旧设备', state: 'Booted' }],
      'runtime-selected': [{ udid: 'selected', name: '本轮设备', state: 'Booted' }],
    } }), { LYNX_IOS_DEVICE_ID: 'selected' })
    const values: Record<string, string> = {
      SIMULATOR_MODEL_IDENTIFIER: 'selected-model',
      SIMULATOR_RUNTIME_VERSION: '26.0',
      SIMULATOR_RUNTIME_BUILD_VERSION: 'selected-build',
      SIMULATOR_MAINSCREEN_WIDTH: '1206',
      SIMULATOR_MAINSCREEN_HEIGHT: '2622',
      SIMULATOR_MAINSCREEN_SCALE: '3',
    }
    run.mockImplementation(async (tool, args) => {
      expect(tool).toBe('xcrun')
      expect(args.slice(0, 3)).toEqual(['simctl', 'getenv', 'selected'])
      return values[args[3]!]!
    })
    const report = structuredClone(baseline) as NativePlatformReport
    report.environment.viewport = { width: 0, height: 0, pixelRatio: 0 }
    const actual = await enrichEnvironment(report, path.resolve('host'), device)
    expect(actual.environment).toMatchObject({
      deviceName: '本轮设备',
      deviceModel: 'selected-model',
      runtimeIdentifier: 'runtime-selected',
      osVersion: '26.0',
      osBuild: 'selected-build',
      viewport: { width: 402, height: 874, pixelRatio: 3 },
    })
    expect(run).toHaveBeenCalledTimes(6)
  })

  it('Android 元数据命令全部携带选定 serial', async () => {
    const device = selectAndroidDevice('first device\nselected device', { LYNX_ANDROID_DEVICE_ID: 'selected' })
    run.mockImplementation(async (tool, args) => {
      expect(tool).toBe('adb')
      expect(args.slice(0, 3)).toEqual(['-s', 'selected', 'shell'])
      if (args[4] === 'size') {
        return 'Physical size: 1080x1920'
      }
      if (args[4] === 'density') {
        return 'Physical density: 320'
      }
      return args[4] === 'ro.build.version.sdk' ? '35' : 'selected-value'
    })
    const report = structuredClone(baseline) as NativePlatformReport
    report.environment.viewport = { width: 0, height: 0, pixelRatio: 0 }
    const actual = await enrichEnvironment(report, path.resolve('host'), device)
    expect(actual.environment).toMatchObject({ deviceName: 'selected-value', apiLevel: 35, viewport: { width: 1080, height: 1920, pixelRatio: 2 } })
    expect(run).toHaveBeenCalledTimes(8)
  })
})
