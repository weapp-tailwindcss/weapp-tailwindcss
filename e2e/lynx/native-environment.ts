import type { NativePlatformReport, NativeRuntimeEnvironment } from '../../examples/react-lynx/src/compatibility/types'
import type { AndroidDevice, IosDevice, NativeDevice } from './native-device'
import process from 'node:process'
import { command } from './native-command'
import { adbArgs } from './native-device'

function positiveNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && value > 0 ? value : fallback
}

async function androidEnvironment(source: NativePlatformReport, hostDir: string, device: AndroidDevice): Promise<NativeRuntimeEnvironment> {
  const getprop = async (name: string) => (await command('adb', adbArgs(device, ['shell', 'getprop', name]), hostDir, 30_000)).trim()
  const [deviceName, deviceModel, osVersion, osBuild, apiLevel, abi, displaySize, density] = await Promise.all([
    getprop('ro.product.name'),
    getprop('ro.product.model'),
    getprop('ro.build.version.release'),
    getprop('ro.build.id'),
    getprop('ro.build.version.sdk'),
    getprop('ro.product.cpu.abi'),
    command('adb', adbArgs(device, ['shell', 'wm', 'size']), hostDir, 30_000),
    command('adb', adbArgs(device, ['shell', 'wm', 'density']), hostDir, 30_000),
  ])
  const size = displaySize.match(/(\d+)x(\d+)/)
  const dpi = Number(density.match(/(\d+)/)?.[1])
  return {
    ...source.environment,
    deviceName,
    deviceModel,
    osName: 'Android',
    osVersion,
    osBuild,
    runtimeIdentifier: `android-${apiLevel}`,
    apiLevel: Number(apiLevel),
    abi,
    viewport: {
      width: positiveNumber(source.environment.viewport.width, Number(size?.[1])),
      height: positiveNumber(source.environment.viewport.height, Number(size?.[2])),
      pixelRatio: positiveNumber(source.environment.viewport.pixelRatio, dpi / 160),
    },
  }
}

async function iosEnvironment(source: NativePlatformReport, hostDir: string, device: IosDevice): Promise<NativeRuntimeEnvironment> {
  const getenv = async (name: string) => (await command('xcrun', ['simctl', 'getenv', device.id, name], hostDir, 30_000)).trim()
  const [deviceModel, osVersion, osBuild, screenWidth, screenHeight, screenScale] = await Promise.all([
    getenv('SIMULATOR_MODEL_IDENTIFIER'),
    getenv('SIMULATOR_RUNTIME_VERSION'),
    getenv('SIMULATOR_RUNTIME_BUILD_VERSION'),
    getenv('SIMULATOR_MAINSCREEN_WIDTH'),
    getenv('SIMULATOR_MAINSCREEN_HEIGHT'),
    getenv('SIMULATOR_MAINSCREEN_SCALE'),
  ])
  const scale = Number(screenScale)
  return {
    ...source.environment,
    deviceName: device.name,
    deviceModel,
    osName: 'iOS',
    osVersion,
    osBuild,
    runtimeIdentifier: device.runtime,
    abi: process.arch === 'arm64' ? 'arm64' : 'x86_64',
    viewport: {
      width: positiveNumber(source.environment.viewport.width, Number(screenWidth) / scale),
      height: positiveNumber(source.environment.viewport.height, Number(screenHeight) / scale),
      pixelRatio: positiveNumber(source.environment.viewport.pixelRatio, scale),
    },
  }
}

export async function enrichEnvironment(report: NativePlatformReport, hostDir: string, device: NativeDevice) {
  report.environment = device.platform === 'android'
    ? await androidEnvironment(report, hostDir, device)
    : await iosEnvironment(report, hostDir, device)
  return report
}
