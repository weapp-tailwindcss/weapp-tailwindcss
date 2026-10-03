import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { command } from './lynx/native-command'
import { adbArgs, resolveNativeDevice, selectAndroidDevice, selectIosDevice } from './lynx/native-device'

vi.mock('./lynx/native-command', () => ({ command: vi.fn() }))

const run = vi.mocked(command)
const iosDevices = JSON.stringify({
  devices: {
    'runtime-first': [{ udid: 'first', name: '第一台', state: 'Booted', isAvailable: true }],
    'runtime-selected': [
      { udid: 'selected', name: '选定设备', state: 'Booted', isAvailable: true },
      { udid: 'stopped', name: '未启动设备', state: 'Shutdown', isAvailable: true },
      { udid: 'unavailable', name: '不可用设备', state: 'Booted', isAvailable: false },
    ],
  },
})

beforeEach(() => vi.resetAllMocks())

describe('Lynx 原生设备身份', () => {
  it('多台 Android 在线时选择显式目标，不猜默认 serial', () => {
    const listing = 'List of devices attached\nfirst device product:a\nselected device product:b\n'
    expect(selectAndroidDevice(listing, { LYNX_ANDROID_DEVICE_ID: 'selected' })).toEqual({ platform: 'android', id: 'selected' })
    expect(() => selectAndroidDevice(listing, {})).toThrow('唯一明确')
    expect(() => selectAndroidDevice(listing, { LYNX_ANDROID_DEVICE_ID: 'missing' })).toThrow('指定设备不可用')
  })

  it.each(['offline', 'unauthorized'])('显式 Android 设备处于 %s 时拒绝切换到其他在线设备', (state) => {
    expect(() => selectAndroidDevice(`first device\nselected ${state}`, { LYNX_ANDROID_DEVICE_ID: 'selected' })).toThrow(state)
  })

  it('Android 只有一台在线时可自动选择，但冲突配置仍失败', () => {
    expect(selectAndroidDevice('selected device\nother offline', {})).toEqual({ platform: 'android', id: 'selected' })
    expect(selectAndroidDevice('selected device', { ANDROID_SERIAL: 'selected' }).id).toBe('selected')
    expect(() => selectAndroidDevice('selected device', { ANDROID_SERIAL: 'other', LYNX_ANDROID_DEVICE_ID: 'selected' })).toThrow('歧义')
    expect(() => selectAndroidDevice('List of devices attached\n', {})).toThrow('唯一明确')
  })

  it('iOS 保留显式目标的名称、runtime 与构建 destination', () => {
    expect(selectIosDevice(iosDevices, { LYNX_IOS_DEVICE_ID: 'selected' })).toEqual({
      platform: 'ios',
      id: 'selected',
      name: '选定设备',
      runtime: 'runtime-selected',
      destination: 'platform=iOS Simulator,id=selected',
    })
    expect(() => selectIosDevice(iosDevices, {})).toThrow('唯一明确')
  })

  it.each(['missing', 'stopped', 'unavailable'])('iOS 显式目标 %s 不可运行时拒绝替换', (id) => {
    expect(() => selectIosDevice(iosDevices, { LYNX_IOS_DEVICE_ID: id })).toThrow('指定设备不可用')
  })

  it('单台 Booted iOS 可自动选择，并允许 destination 明确指定目标', () => {
    const single = JSON.stringify({ devices: { runtime: [{ udid: 'selected', name: '设备', state: 'Booted' }] } })
    expect(selectIosDevice(single, {}).id).toBe('selected')
    const destination = 'platform=iOS Simulator,id=selected,arch=arm64'
    expect(selectIosDevice(iosDevices, { LYNX_IOS_DESTINATION: destination }).destination).toBe(destination)
  })

  it.each([
    'platform=iOS Simulator,id=first',
    'platform=iOS Simulator,name=选定设备',
    'platform=iOS,id=selected',
    'platform=iOS Simulator,id=selected,id=first',
    '',
  ])('iOS destination %s 不能掩盖目标歧义', (destination) => {
    expect(() => selectIosDevice(iosDevices, { LYNX_IOS_DEVICE_ID: 'selected', LYNX_IOS_DESTINATION: destination })).toThrow()
  })

  it('设备发现只返回明确身份，不启动或切换设备', async () => {
    const cwd = path.resolve('native host')
    run.mockResolvedValueOnce('selected device').mockResolvedValueOnce(iosDevices)
    await expect(resolveNativeDevice('android', cwd, {})).resolves.toEqual({ platform: 'android', id: 'selected' })
    await expect(resolveNativeDevice('ios', cwd, { LYNX_IOS_DEVICE_ID: 'selected' })).resolves.toMatchObject({ id: 'selected' })
    expect(run.mock.calls).toEqual([
      ['adb', ['devices', '-l'], cwd, 30_000],
      ['xcrun', ['simctl', 'list', 'devices', 'available', '--json'], cwd, 30_000],
    ])
  })

  it.each(['/artifacts/raw.mp4', 'C:\\artifacts\\raw.mp4', 'relative.mp4'])('Android 导出文件 %s 仍绑定同一目标', (output) => {
    expect(adbArgs({ platform: 'android', id: 'selected' }, ['pull', '/sdcard/capture.mp4', output]))
      .toEqual(['-s', 'selected', 'pull', '/sdcard/capture.mp4', output])
  })
})
