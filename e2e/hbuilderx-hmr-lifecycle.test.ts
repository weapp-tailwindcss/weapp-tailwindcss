import { Buffer } from 'node:buffer'
import { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { uniAppAppCases, uniAppXAppCases } from './hbuilderx-local/cases'
import { assertHarmonyProcessUnchanged, hasHarmonyMarker } from './hbuilderx-local/harmony-runtime'
import { classifyHmrStep, observeHmrStep } from './hbuilderx-local/hmr-lifecycle'

describe('原生 HMR 生命周期验收', () => {
  it('只有普通 uni-app 用例显式启用原生热重载', () => {
    expect(uniAppAppCases.length).toBeGreaterThan(0)
    expect(uniAppAppCases.every(item => item.updateMode === 'native-reload')).toBe(true)
    expect(uniAppXAppCases.every(item => item.updateMode === undefined)).toBe(true)
  })

  it.each(['app-android', 'app-ios'] as const)('%s 原生热重载记录本轮重启，仍拒绝更新失败和重装', async (platform) => {
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const child = Object.assign(new ChildProcess(), { stdout, stderr })
    stdout.emit('data', 'App Launch\n')
    const observer = observeHmrStep(child, platform, 'native-reload')
    try {
      stdout.emit('data', '开始差量编译\n项目 demo 编译成功。\n同步手机端程序文件成功\nApp Lau')
      stdout.emit('data', 'nch\n')
      await observer.waitForCompletion(100, () => {}, async () => {})
      expect(observer.snapshot()).toMatchObject({ mode: 'native-reload', state: 'restarted', appLaunchCount: 1 })
      stderr.emit('data', platform === 'app-ios' ? '正在安装HBuilder调试基座...\n' : 'HBuilder调试基座安装成功\n')
      expect(observer.assertNoFallback).toThrow('原生热重载 验收失败：reinstalled')
      stderr.emit('data', '热更新失败\n')
      expect(observer.assertNoFallback).toThrow('failed')
    }
    finally {
      observer.dispose()
    }
    expect(stdout.listenerCount('data')).toBe(0)
    expect(stderr.listenerCount('data')).toBe(0)
  })

  it.each(['app-android', 'app-ios'] as const)('%s 产物与传输完成后重启不能被计作 HMR', async (platform) => {
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const child = Object.assign(new ChildProcess(), { stdout, stderr })
    // 首次启动不属于保存过程；只观察首次运行就绪后的增量。
    stdout.emit('data', 'App Launch\n')
    const observer = observeHmrStep(child, platform)
    try {
      stdout.emit('data', '开始差量编译\n项目 demo 编译成功。\n同步手机端程序文件成功\n')
      await observer.waitForCompletion(100, () => {}, async () => {})
      expect(observer.assertNoFallback).not.toThrow()
      stderr.emit('data', '\u001B[0mApp Launch\u001B[0m at App.uvue:6\n')
      expect(observer.assertNoFallback).toThrow('restarted')
      await expect(observer.waitForCompletion(100, () => {}, async () => {})).rejects.toThrow('restarted')
    }
    finally {
      observer.dispose()
    }
    expect(stdout.listenerCount('data')).toBe(0)
    expect(stderr.listenerCount('data')).toBe(0)
  })

  it('设备必须出现本轮 marker，并保持同一个有效运行进程', () => {
    const tree = { children: [{ attributes: { text: 'save-2' } }] }
    expect(hasHarmonyMarker(tree, 'save-1')).toBe(false)
    expect(hasHarmonyMarker(tree, 'save-2')).toBe(true)
    expect(() => assertHarmonyProcessUnchanged('2970', '2970')).not.toThrow()
    expect(() => assertHarmonyProcessUnchanged('2970', '3051')).toThrow('不能计作纯 HMR')
    expect(() => assertHarmonyProcessUnchanged('', '')).toThrow('不能计作纯 HMR')
  })
  it.each([
    ['编译完成\n热更新传输完成', 'pending'],
    ['热更新完成', 'updated'],
    ['热更新失败\n安装 .hap 到鸿蒙设备\n热更新完成', 'failed'],
    ['安装 .hap 到鸿蒙设备\n热更新完成', 'reinstalled'],
    ['正在安装HBuilder调试基座...\nApp Launch', 'reinstalled'],
    ['HBuilder调试基座安装成功\n热更新完成', 'reinstalled'],
    ['uni-app x调试基座安装成功\nApp Launch', 'reinstalled'],
    ['正在启动HBuilder调试基座...\nApp Launch', 'restarted'],
    ['热更新完成\n\u001B[0mApp Launch\u001B[0m', 'restarted'],
  ])('区分产物、传输、重启与重装：%s', (log, state) => {
    expect(classifyHmrStep(log)).toBe(state)
  })

  it('按保存隔离，跨流分片的早期失败不能被后续日志挤掉', async () => {
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const child = Object.assign(new ChildProcess(), { stdout, stderr })
    stdout.on('data', () => {})
    stderr.on('data', () => {})
    stdout.emit('data', '安装 .hap 到鸿蒙设备\nApp Launch\n')
    const first = observeHmrStep(child)
    const failure = Buffer.from('热更新失败\n')
    stdout.emit('data', failure.subarray(0, 4))
    stderr.emit('data', '设备旁路日志\n')
    stdout.emit('data', failure.subarray(4))
    for (let index = 0; index < 200; index++) {
      stdout.emit('data', `设备日志 ${index}\n`)
    }
    stdout.emit('data', '热更新完成\n')
    await expect(first.waitForCompletion(100, () => {})).rejects.toThrow('failed')
    first.dispose()
    expect(stdout.listenerCount('data')).toBe(1)
    expect(stderr.listenerCount('data')).toBe(1)
    const second = observeHmrStep(child)
    stdout.emit('data', '热更新完成\n')
    await second.waitForCompletion(100, () => {})
    // 完成通知早于 App Launch，运行时取证后仍必须复查。
    stderr.emit('data', 'App Launch\n')
    expect(second.assertNoFallback).toThrow('restarted')
    second.dispose()
  })
})
