import type { CommandDiagnostics } from './native-command-observer'
import type { NativePlatform } from './native-options'
import process from 'node:process'
import { iosSimulatorDestination, parseAdbDevices, requestedIosTarget, requestedTarget, selectTarget } from '../../scripts/e2e-preflight/targets'
import { EnvironmentBlockedError } from '../tailwind-capabilities/environment-block'
import { command } from './native-command'

export interface AndroidDevice {
  platform: 'android'
  id: string
}

export interface IosBuildTarget {
  platform: 'ios'
  id: string
  name: string
  runtime: string
  destination: string
  state: 'Shutdown' | 'Booted'
}

export interface IosDevice extends IosBuildTarget {
  state: 'Booted'
}

export type NativeDevice = AndroidDevice | IosDevice

export function adbArgs(device: AndroidDevice, args: string[]) {
  return ['-s', device.id, ...args]
}

export function selectAndroidDevice(output: string, env: NodeJS.ProcessEnv = process.env): AndroidDevice {
  const devices = parseAdbDevices(output)
  const requested = requestedTarget(['LYNX_ANDROID_DEVICE_ID', 'ANDROID_SERIAL'], [], env)
  const unavailable = devices.find(device => device.id === requested && device.state !== 'device')
  if (unavailable) {
    throw new Error(`Android ${unavailable.id}：${unavailable.state}`)
  }
  const id = selectTarget(devices.filter(device => device.state === 'device').map(device => device.id), requested)
  return { platform: 'android', id }
}

function selectIosTarget(output: string, env: NodeJS.ProcessEnv, states: string[], requireAvailable = false): IosBuildTarget {
  const parsed = JSON.parse(output) as {
    devices: Record<string, Array<{ name: string, udid: string, state: string, isAvailable?: boolean }>>
  }
  const devices = Object.entries(parsed.devices).flatMap(([runtime, items]) => items
    .map(item => ({ ...item, runtime })))
  const requested = requestedIosTarget(['LYNX_IOS_DEVICE_ID'], env)
  const candidates = devices.filter(device => (requireAvailable ? device.isAvailable === true : device.isAvailable !== false) && states.includes(device.state))
  const id = selectTarget(candidates.map(device => device.udid), requested)
  if (devices.filter(device => device.udid === id).length !== 1) {
    throw new Error('iOS 设备库存包含重复身份。')
  }
  const device = devices.find(device => device.udid === id)!
  if (typeof device.name !== 'string' || !device.name.trim() || !device.runtime.trim()) {
    throw new Error('iOS 设备库存缺少名称或 runtime。')
  }
  return {
    platform: 'ios',
    id,
    name: device.name,
    runtime: device.runtime,
    destination: iosSimulatorDestination(id, env['LYNX_IOS_DESTINATION']),
    state: device.state as IosBuildTarget['state'],
  }
}

export function selectIosDevice(output: string, env: NodeJS.ProcessEnv = process.env): IosDevice {
  return selectIosTarget(output, env, ['Booted']) as IosDevice
}

/** CI 新建模拟器在启动前只锁定构建身份，不把 Shutdown 目标视为可运行设备。 */
export function selectIosBuildTarget(output: string, env: NodeJS.ProcessEnv): IosBuildTarget {
  if (!requestedIosTarget(['LYNX_IOS_DEVICE_ID'], env)) {
    throw new Error('iOS 构建目标必须显式指定设备。')
  }
  return selectIosTarget(output, env, ['Shutdown'], true)
}

/** 构建前锁定唯一在线设备，后续运行和证据采集只消费该身份。 */
export async function resolveNativeDevice(platform: NativePlatform, cwd: string, env: NodeJS.ProcessEnv = process.env, diagnostics?: CommandDiagnostics): Promise<NativeDevice> {
  try {
    if (platform === 'android') {
      return selectAndroidDevice(await command('adb', ['devices', '-l'], cwd, 30_000, diagnostics), env)
    }
    const requested = requestedIosTarget(['LYNX_IOS_DEVICE_ID'], env)
    // 显式目标只查询自身；simctl 的搜索为 contains，返回后仍按精确 ID 和可运行状态校验。
    return selectIosDevice(await command('xcrun', ['simctl', 'list', 'devices', requested ?? 'available', '--json'], cwd, 30_000, diagnostics), env)
  }
  catch (error) {
    throw new EnvironmentBlockedError(`Lynx ${platform} 设备发现失败：${String(error)}`, { cause: error })
  }
}
