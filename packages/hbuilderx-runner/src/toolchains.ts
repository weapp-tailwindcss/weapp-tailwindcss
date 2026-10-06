import type { AndroidToolchain, ToolResult } from './types'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { classifyHBuilderXOutput } from './logs'

export function runTool(command: string, args: string[]): ToolResult {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
  })
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    status: result.status,
    signal: result.signal,
  }
}

export function resolveAdbCommand(env: NodeJS.ProcessEnv = process.env): AndroidToolchain {
  const adb = runTool('adb', ['version'])
  if (adb.ok) {
    return {
      command: 'adb',
      output: adb.output,
      env: {},
    }
  }

  const candidates = [
    env['ANDROID_HOME'],
    env['ANDROID_SDK_ROOT'],
    env['HOME'] ? path.join(env['HOME'], 'Library/Android/sdk') : undefined,
    '/opt/android-sdk',
    '/usr/local/share/android-sdk',
  ].filter((item): item is string => Boolean(item))

  for (const sdkRoot of candidates) {
    const adbPath = path.join(sdkRoot, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
    const candidate = runTool(adbPath, ['version'])
    if (candidate.ok) {
      return {
        command: adbPath,
        output: candidate.output,
        env: {
          ANDROID_HOME: env['ANDROID_HOME'] ?? sdkRoot,
          ANDROID_SDK_ROOT: env['ANDROID_SDK_ROOT'] ?? sdkRoot,
          PATH: `${path.dirname(adbPath)}${path.delimiter}${env['PATH'] ?? ''}`,
        },
      }
    }
  }

  return {
    command: 'adb',
    output: adb.output,
    env: undefined,
  }
}

export function assertAndroidToolchain(env: NodeJS.ProcessEnv = process.env) {
  const adb = resolveAdbCommand(env)
  if (!adb.env && adb.command === 'adb') {
    throw new Error([
      '当前机器缺少 Android App E2E 所需的 adb，无法运行 HBuilderX app-android E2E。',
      `adb: ${adb.output || 'not found'}`,
      '请先安装 Android SDK platform-tools，并确认 adb 可在 PATH 中访问。',
      '如需指定设备，请设置 E2E_HBUILDERX_ANDROID_DEVICE_ID。',
    ].join('\n'))
  }
  return adb.env
}

export function assertIosSimulatorToolchain(env: NodeJS.ProcessEnv = process.env) {
  if (process.platform !== 'darwin') {
    throw new Error('HBuilderX iOS 模拟器 E2E 只能在 macOS 本地运行。')
  }

  const xcodeSelect = runTool('xcode-select', ['-p'])
  const simctl = runTool('xcrun', ['--find', 'simctl'])
  const xcodebuild = runTool('xcrun', ['--find', 'xcodebuild'])
  const firstLaunchStatus = xcodebuild.ok ? runTool('xcodebuild', ['-checkFirstLaunchStatus']) : undefined

  if (!simctl.ok || !xcodebuild.ok || firstLaunchStatus?.ok === false) {
    throw new Error([
      '当前机器缺少 iOS 模拟器所需的完整 Xcode 工具链，无法运行 HBuilderX app-ios E2E。',
      `xcode-select: ${xcodeSelect.output || 'unknown'}`,
      `DEVELOPER_DIR: ${env['DEVELOPER_DIR'] || '未设置'}`,
      `simctl: ${simctl.output || 'not found'}`,
      `xcodebuild: ${xcodebuild.output || 'not found'}`,
      `firstLaunchStatus: ${firstLaunchStatus?.output || (firstLaunchStatus?.ok === false ? 'not ready' : 'unknown')}`,
      '请安装完整 Xcode，并执行 sudo xcode-select -s /Applications/Xcode.app/Contents/Developer，或用 DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer 临时指定后重试。',
      '如果 firstLaunchStatus 不是 ready，请先打开 Xcode 完成首次组件安装，或执行 sudo xcodebuild -runFirstLaunch。',
    ].join('\n'))
  }
}

export interface IosSimulatorDevice {
  lastBootedAt?: string
  name: string
  state: string
  udid: string
}

export function parseIosSimulatorDevices(output: string) {
  const jsonStart = output.indexOf('{')
  const jsonEnd = output.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd < jsonStart) {
    return []
  }

  let value: unknown
  try {
    value = JSON.parse(output.slice(jsonStart, jsonEnd + 1))
  }
  catch {
    return []
  }

  if (!value || typeof value !== 'object' || !('devices' in value)) {
    return []
  }

  const devices = (value as { devices?: unknown }).devices
  if (!devices || typeof devices !== 'object') {
    return []
  }

  return Object.values(devices).flatMap((runtimeDevices) => {
    if (!Array.isArray(runtimeDevices)) {
      return []
    }
    return runtimeDevices.flatMap((device): IosSimulatorDevice[] => {
      if (
        !device
        || typeof device !== 'object'
        || !('udid' in device)
        || typeof device.udid !== 'string'
        || ('isAvailable' in device && device.isAvailable === false)
      ) {
        return []
      }
      return [{
        ...('lastBootedAt' in device && typeof device.lastBootedAt === 'string' ? { lastBootedAt: device.lastBootedAt } : {}),
        name: 'name' in device && typeof device.name === 'string' ? device.name : device.udid,
        state: 'state' in device && typeof device.state === 'string' ? device.state : 'Unknown',
        udid: device.udid,
      }]
    })
  })
}

export function selectPreferredIosSimulatorDevice(devices: IosSimulatorDevice[]) {
  return [...devices].sort((left, right) => {
    const stateDifference = Number(right.state === 'Booted') - Number(left.state === 'Booted')
    if (stateDifference !== 0) {
      return stateDifference
    }
    const leftLastBootedAt = Date.parse(left.lastBootedAt ?? '')
    const rightLastBootedAt = Date.parse(right.lastBootedAt ?? '')
    const lastBootedDifference = (Number.isNaN(rightLastBootedAt) ? 0 : rightLastBootedAt) - (Number.isNaN(leftLastBootedAt) ? 0 : leftLastBootedAt)
    if (lastBootedDifference !== 0) {
      return lastBootedDifference
    }
    return Number(/^iPhone\b/.test(right.name)) - Number(/^iPhone\b/.test(left.name))
  })[0]
}

export function resolveIosSimulatorDeviceId(env: NodeJS.ProcessEnv = process.env) {
  const explicitDeviceId = env['E2E_HBUILDERX_IOS_DEVICE_ID']
  if (explicitDeviceId) {
    return explicitDeviceId
  }

  const booted = runTool('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'])
  const bootedDevices = booted.ok ? parseIosSimulatorDevices(booted.output) : []
  const bootedDevice = selectPreferredIosSimulatorDevice(bootedDevices)
  if (bootedDevice) {
    return bootedDevice.udid
  }

  const available = runTool('xcrun', ['simctl', 'list', 'devices', 'available', '--json'])
  const availableDevices = available.ok ? parseIosSimulatorDevices(available.output) : []
  const availableDevice = selectPreferredIosSimulatorDevice(availableDevices)
  if (availableDevice) {
    return availableDevice.udid
  }

  throw new Error([
    '未找到可用于 HBuilderX app-ios E2E 的 iOS 模拟器。',
    `booted: ${booted.output || 'empty'}`,
    `available: ${available.output || 'empty'}`,
    '请先在 Xcode 中安装并启动一个模拟器，或设置 E2E_HBUILDERX_IOS_DEVICE_ID。',
  ].join('\n'))
}

export function resolveHdcCommand(env: NodeJS.ProcessEnv = process.env) {
  const candidates = [
    env['DEMO_VISUAL_HARMONY_HDC_PATH'],
    env['E2E_HBUILDERX_HARMONY_HDC_PATH'],
    env['HDC_PATH'],
    'hdc',
    process.platform === 'darwin'
      ? '/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc'
      : undefined,
  ].filter((item): item is string => Boolean(item))

  for (const candidate of candidates) {
    const result = runTool(candidate, ['version'])
    if (result.ok) {
      return candidate
    }
  }

  throw new Error([
    '当前机器缺少 Harmony App E2E 所需的 hdc，无法运行 HBuilderX app-harmony E2E。',
    '请安装 DevEco Studio，或设置 DEMO_VISUAL_HARMONY_HDC_PATH=/path/to/hdc。',
    '如需指定设备，请设置 E2E_HBUILDERX_HARMONY_DEVICE_ID 或 DEMO_VISUAL_HARMONY_DEVICE_ID。',
  ].join('\n'))
}

export function parseHdcTargets(output: string) {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !/^\[empty\]$/i.test(line))
}

export function assertHarmonyToolchain(env: NodeJS.ProcessEnv = process.env, deviceId?: string) {
  const hdc = resolveHdcCommand(env)
  const result = runTool(hdc, ['list', 'targets'])
  const targets = result.ok ? parseHdcTargets(result.output) : []
  if (!result.ok || targets.length === 0 || (deviceId && !targets.includes(deviceId))) {
    const issue = classifyHBuilderXOutput(result.output)
    throw new Error([
      '当前 Harmony hdc 无法列出设备，无法运行 HBuilderX app-harmony E2E。',
      result.output || `targets=empty exit=${result.status} signal=${result.signal ?? 'none'}`,
      `requestedDevice=${deviceId ?? '任意已连接设备'}`,
      `detectedTargets=${targets.join(', ') || 'empty'}`,
      `issue=${issue.kind}: ${issue.message}`,
      '请确认 Harmony 模拟器或真机已连接。',
    ].join('\n'))
  }
  return hdc
}
