import type { AppCase } from './hbuilderx-local/cases'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bindAppTarget } from './hbuilderx-local/app-target'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
vi.mock('./hbuilderx-local/process', () => ({ resolveHdcCommand: () => 'hdc' }))

const item = (platform: AppCase['platform'], launchArgs: string[] = []) => ({ platform, launchArgs }) as AppCase
const output = (stdout: string) => ({ status: 0, stdout, stderr: '' }) as ReturnType<typeof spawnSync>
const iosDevices = (ids: string[]) => JSON.stringify({ devices: { ios: ids.map(udid => ({ udid, state: 'Booted' })) } })

describe('HBuilderX App 启动与证据的目标身份', () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset()
  })

  it('多模拟器显式指定第二台，同一 ID 写入启动参数且不修改原用例', () => {
    vi.mocked(spawnSync).mockReturnValue(output(iosDevices(['first', 'second'])))
    const source = item('app-ios', ['--iosTarget', 'simulator'])
    const bound = bindAppTarget(source, { E2E_HBUILDERX_IOS_DEVICE_ID: 'second', E2E_HBUILDERX_IOS_SCREENSHOT_TARGET: 'second' })
    expect(bound.launchArgs).toEqual(['--iosTarget', 'simulator', '--deviceId', 'second'])
    expect(source.launchArgs).toEqual(['--iosTarget', 'simulator'])
  })

  it.each([
    { ids: ['first', 'second'], env: {}, error: '唯一明确' },
    { ids: ['first'], env: { E2E_HBUILDERX_IOS_DEVICE_ID: 'missing' }, error: '指定设备不可用' },
    { ids: [], env: {}, error: '唯一明确' },
  ])('拒绝缺失或有歧义的目标：$ids', ({ ids, env, error }) => {
    vi.mocked(spawnSync).mockReturnValue(output(iosDevices(ids)))
    expect(() => bindAppTarget(item('app-ios'), env)).toThrow(error)
  })

  it.each(['app-ios', 'app-android', 'app-harmony'] as const)('%s 在执行设备命令前拒绝运行与截图冲突', (platform) => {
    const envs = {
      'app-ios': { E2E_HBUILDERX_IOS_SCREENSHOT_TARGET: 'second' },
      'app-android': { E2E_HBUILDERX_ANDROID_SCREENSHOT_DEVICE_ID: 'second' },
      'app-harmony': { DEMO_VISUAL_HARMONY_SCREENSHOT_DEVICE_ID: 'second' },
    }
    expect(() => bindAppTarget(item(platform, ['--deviceId', 'first']), envs[platform])).toThrow('歧义')
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it.each([
    { args: ['--iosTarget', 'device'], env: {} },
    { args: ['--iosTarget', 'simulator'], env: { E2E_HBUILDERX_IOS_TARGET: 'device' } },
    { args: ['--iosTarget', 'uuid'], env: {} },
  ])('拒绝不属于模拟器的 iosTarget：$args', ({ args, env }) => {
    expect(() => bindAppTarget(item('app-ios', args), env)).toThrow('仅支持')
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it.each([
    ['--deviceId'],
    ['--deviceId', '--iosTarget', 'simulator'],
    ['--deviceId='],
    ['--deviceId', 'same', '--deviceId=same'],
    ['--deviceId', 'first', '--deviceId', 'second'],
  ])('拒绝重复或不完整的参数：%j', (...args) => {
    expect(() => bindAppTarget(item('app-ios', args), {})).toThrow(/缺少|重复/)
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it.each(['--deviceId=second', '--deviceId'])('已有设备参数保持唯一：%s', (option) => {
    vi.mocked(spawnSync).mockReturnValue(output(iosDevices(['first', 'second'])))
    const args = option.includes('=') ? [option] : [option, 'second']
    expect(bindAppTarget(item('app-ios', args), { E2E_HBUILDERX_IOS_DEVICE_ID: 'second' }).launchArgs)
      .toEqual([...args, '--iosTarget', 'simulator'])
  })

  it.each([
    { platform: 'app-android' as const, stdout: 'first device\nsecond device\n', env: { E2E_HBUILDERX_ANDROID_DEVICE_ID: 'second' } },
    { platform: 'app-harmony' as const, stdout: 'first\nsecond\n', env: { E2E_HBUILDERX_HARMONY_DEVICE_ID: 'second' } },
  ])('$platform 将指定设备写入启动参数', ({ platform, stdout, env }) => {
    vi.mocked(spawnSync).mockReturnValue(output(stdout))
    expect(bindAppTarget(item(platform), env).launchArgs).toEqual(['--deviceId', 'second'])
  })

  it('仅通过 SDK 配置提供 adb 时沿用工具链解析后的命令与环境', () => {
    const sdk = path.resolve('android-sdk')
    const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
    vi.mocked(spawnSync).mockImplementation(((command: string, args: string[]) => {
      if (command === 'adb') {
        return { status: 1, stdout: '', stderr: 'not found' }
      }
      if (command === adb) {
        return output(args[0] === 'version' ? 'Android Debug Bridge' : 'selected device\n')
      }
      throw new Error(`unexpected command: ${command}`)
    }) as typeof spawnSync)
    expect(bindAppTarget(item('app-android'), { ANDROID_HOME: sdk, PATH: 'original-path' }).launchArgs)
      .toEqual(['--deviceId', 'selected'])
    expect(spawnSync).toHaveBeenCalledWith(adb, ['devices', '-l'], expect.objectContaining({
      env: expect.objectContaining({ PATH: `${path.dirname(adb)}${path.delimiter}original-path` }),
    }))
  })

  it.each(['[Empty]', '[empty]'])('Harmony 空目标哨兵不作为设备：%s', (stdout) => {
    vi.mocked(spawnSync).mockReturnValue(output(stdout))
    expect(() => bindAppTarget(item('app-harmony'), {})).toThrow('唯一明确')
  })
})
