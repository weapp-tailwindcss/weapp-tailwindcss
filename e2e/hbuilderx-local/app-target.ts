import type { AppCase } from './cases'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { parseHdcTargets, resolveAdbCommand } from '../../packages/hbuilderx-runner/src/toolchains'
import { parseAdbDevices, requestedTarget, selectTarget } from '../../scripts/e2e-preflight/targets'
import { resolveHdcCommand } from './process'

const deviceKeys = {
  'app-ios': ['E2E_HBUILDERX_IOS_DEVICE_ID', 'E2E_HBUILDERX_IOS_SCREENSHOT_TARGET'],
  'app-android': ['E2E_HBUILDERX_ANDROID_DEVICE_ID', 'E2E_HBUILDERX_ANDROID_SCREENSHOT_DEVICE_ID', 'ANDROID_SERIAL'],
  'app-harmony': ['E2E_HBUILDERX_HARMONY_DEVICE_ID', 'DEMO_VISUAL_HARMONY_DEVICE_ID', 'DEMO_VISUAL_HARMONY_SCREENSHOT_DEVICE_ID'],
} as const

export function readAppLaunchOption(args: string[], option: string) {
  const values: string[] = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg !== option && !arg.startsWith(`${option}=`)) {
      continue
    }
    const value = arg === option ? args[++index] : arg.slice(option.length + 1)
    if (!value?.trim() || value.startsWith('--')) {
      throw new Error(`${option} 缺少有效参数`)
    }
    values.push(value)
  }
  if (values.length > 1) {
    throw new Error(`${option} 不允许重复指定`)
  }
  return values[0]
}

function deviceOutput(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, { encoding: 'utf8', env, timeout: 30_000 })
  if (result.status !== 0) {
    throw new Error(`无法确认 App 目标设备：${result.error?.message || result.stderr || result.stdout || result.status}`)
  }
  return result.stdout
}

/** 启动前锁定唯一在线设备；启动参数、截图与运行时探针共享同一个用例身份。 */
export function bindAppTarget(item: AppCase, env: NodeJS.ProcessEnv = process.env): AppCase {
  const args = [...(item.launchArgs ?? [])]
  const configuredDevice = readAppLaunchOption(args, '--deviceId')
  const keys = deviceKeys[item.platform]
  const requested = requestedTarget([...keys, '--deviceId'], ['booted', 'simulator'], { ...env, '--deviceId': configuredDevice })
  let ids: string[]
  if (item.platform === 'app-ios') {
    const mode = readAppLaunchOption(args, '--iosTarget')
    if ([mode, env['E2E_HBUILDERX_IOS_TARGET']].some(value => value !== undefined && value !== 'simulator')) {
      throw new Error('App iOS E2E 仅支持 --iosTarget simulator；设备 UUID 请通过 --deviceId 指定。')
    }
    const output = deviceOutput('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], env)
    const devices = JSON.parse(output) as { devices: Record<string, { udid: string, state: string, isAvailable?: boolean }[]> }
    ids = Object.values(devices.devices).flat().filter(device => device.state === 'Booted' && device.isAvailable !== false).map(device => device.udid)
    if (!mode) {
      args.push('--iosTarget', 'simulator')
    }
  }
  else if (item.platform === 'app-android') {
    const adb = resolveAdbCommand(env)
    ids = parseAdbDevices(deviceOutput(adb.command, ['devices', '-l'], { ...env, ...adb.env }))
      .filter(device => device.state === 'device')
      .map(device => device.id)
  }
  else {
    ids = parseHdcTargets(deviceOutput(resolveHdcCommand(env), ['list', 'targets'], env))
  }
  const device = selectTarget(ids, requested)
  if (configuredDevice && configuredDevice !== device) {
    throw new Error('--deviceId 必须明确指定设备 ID，不能使用通用别名。')
  }
  if (!configuredDevice) {
    args.push('--deviceId', device)
  }
  return { ...item, launchArgs: args }
}
