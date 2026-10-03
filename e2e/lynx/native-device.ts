import type { NativePlatform } from './native-options'
import process from 'node:process'
import { iosSimulatorDestination, parseAdbDevices, requestedIosTarget, requestedTarget, selectTarget } from '../../scripts/e2e-preflight/targets'
import { command } from './native-command'

export interface AndroidDevice {
  platform: 'android'
  id: string
}

export interface IosDevice {
  platform: 'ios'
  id: string
  name: string
  runtime: string
  destination: string
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

export function selectIosDevice(output: string, env: NodeJS.ProcessEnv = process.env): IosDevice {
  const parsed = JSON.parse(output) as {
    devices: Record<string, Array<{ name: string, udid: string, state: string, isAvailable?: boolean }>>
  }
  const devices = Object.entries(parsed.devices).flatMap(([runtime, items]) => items
    .filter(item => item.isAvailable !== false)
    .map(item => ({ ...item, runtime })))
  const requested = requestedIosTarget(['LYNX_IOS_DEVICE_ID'], env)
  const id = selectTarget(devices.filter(device => device.state === 'Booted').map(device => device.udid), requested)
  const device = devices.find(device => device.udid === id)!
  return {
    platform: 'ios',
    id,
    name: device.name,
    runtime: device.runtime,
    destination: iosSimulatorDestination(id, env['LYNX_IOS_DESTINATION']),
  }
}

/** 构建前锁定唯一在线设备，后续运行和证据采集只消费该身份。 */
export async function resolveNativeDevice(platform: NativePlatform, cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<NativeDevice> {
  if (platform === 'android') {
    return selectAndroidDevice(await command('adb', ['devices', '-l'], cwd, 30_000), env)
  }
  return selectIosDevice(await command('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], cwd, 30_000), env)
}
