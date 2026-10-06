import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { PNG } from 'pngjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeIosRuntimeScreenshot, captureIosScreenshot, waitForIosRuntimeEvidence } from './hbuilderx-local/ios-runtime'

const state = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: state.spawn,
}))

const initialClass = 'w-[120px] h-[30px] bg-[#102938]'
const changedClass = 'w-[120px] h-[30px] bg-[#3b0764]'
let directory: string

function rectangle(image: PNG, x: number, y: number, width: number, height: number, color: number[]) {
  for (let row = y; row < y + height; row++) {
    for (let column = x; column < x + width; column++) {
      image.data.set([...color, 255], (row * image.width + column) * 4)
    }
  }
}

function screenshot(color = [16, 41, 56], x = 20) {
  const image = new PNG({ width: 400, height: 240 })
  image.data.fill(255)
  rectangle(image, x, 60, 120, 30, color)
  return image
}

function mockScreenshots(images: PNG[]) {
  state.spawn.mockImplementation((_command: string, args: string[]) => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
    const image = images.shift()
    if (!image) {
      throw new Error('意外的额外截图')
    }
    writeFileSync(args[args.length - 1]!, PNG.sync.write(image))
    queueMicrotask(() => child.emit('close', 0, null))
    return child
  })
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'ios-runtime-test-'))
  state.spawn.mockReset()
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('iOS 样式标记运行时证据', () => {
  it('只改变状态栏或滚动条不能证明样式更新', () => {
    const before = screenshot()
    const after = screenshot()
    rectangle(after, 390, 20, 5, 150, [20, 20, 20])
    const evidence = analyzeIosRuntimeScreenshot(after, initialClass, { image: before, markerClass: initialClass })
    expect(evidence).toMatchObject({ ready: false, markerPixelChanges: 0 })
  })

  it('支持目标区域变色与同色位置变化，且报告为样式而非节点文字证据', () => {
    const before = screenshot()
    const changed = analyzeIosRuntimeScreenshot(screenshot([59, 7, 100]), changedClass, { image: before, markerClass: initialClass })
    expect(changed).toMatchObject({ ready: true, evidenceKind: 'visual-style-marker', markerPixelChanges: 3600 })
    const moved = analyzeIosRuntimeScreenshot(screenshot(undefined, 70), initialClass, { image: before, markerClass: initialClass })
    expect(moved.ready).toBe(true)
    expect(moved.markerPixelChanges).toBeGreaterThan(100)
  })

  it('缺失标记、比例不符与重复独立色块不能通过', () => {
    expect(analyzeIosRuntimeScreenshot(screenshot(), changedClass).ready).toBe(false)
    expect(analyzeIosRuntimeScreenshot(screenshot(), 'w-[30px] h-[120px] bg-[#102938]').ready).toBe(false)
    const duplicate = screenshot()
    rectangle(duplicate, 220, 150, 120, 30, [16, 41, 56])
    expect(analyzeIosRuntimeScreenshot(duplicate, initialClass)).toMatchObject({ ready: false, marker: { candidateCount: 2 } })
  })

  it('前后截图尺寸变化或无法识别初始标记不能用像素数量兜底', () => {
    expect(() => analyzeIosRuntimeScreenshot(screenshot(), initialClass, { image: new PNG({ width: 20, height: 20 }), markerClass: initialClass })).toThrow('尺寸不一致')
    expect(() => analyzeIosRuntimeScreenshot(screenshot(), initialClass, { image: screenshot([59, 7, 100]), markerClass: initialClass })).toThrow('初始样式标记')
    expect(() => analyzeIosRuntimeScreenshot(screenshot(), 'bg-red-500')).toThrow('显式十六进制')
  })

  it('首次旧帧不能结束等待，后续绑定设备的新目标区域才形成证据', async () => {
    const before = path.join(directory, 'before.png')
    await writeFile(before, PNG.sync.write(screenshot()))
    mockScreenshots([screenshot(), screenshot([59, 7, 100])])
    const evidence = await waitForIosRuntimeEvidence({
      deviceId: 'bound-device-uuid',
      ensureRunning: () => {},
      markerClass: changedClass,
      previous: { screenshot: before, markerClass: initialClass },
      screenshot: path.join(directory, 'after.png'),
      screenshotTimeoutMs: 25,
      timeoutMs: 1000,
    })
    expect(evidence.ready).toBe(true)
    expect(state.spawn).toHaveBeenCalledTimes(2)
    expect(state.spawn.mock.calls.every(([, args]) => args[2] === 'bound-device-uuid')).toBe(true)
    expect(state.spawn.mock.calls.every(([, , options]) => options.timeout <= 25)).toBe(true)
  })

  it('截图期间的生命周期失败不能被正确色块覆盖', async () => {
    mockScreenshots([screenshot()])
    const ensureRunning = vi.fn().mockImplementationOnce(() => {}).mockImplementation(() => {
      throw new Error('restarted')
    })
    await expect(waitForIosRuntimeEvidence({
      deviceId: 'bound-device-uuid',
      ensureRunning,
      markerClass: initialClass,
      screenshot: path.join(directory, 'after.png'),
      timeoutMs: 1000,
    })).rejects.toThrow('restarted')
  })

  it('截图必须绑定确定设备，不允许 booted 别名重新选择目标', async () => {
    await expect(captureIosScreenshot(path.join(directory, 'after.png'), 'booted')).rejects.toThrow('设备 UUID')
    expect(state.spawn).not.toHaveBeenCalled()
  })

  it('截图命令失败会清除旧帧并失败，不复用上次文件', async () => {
    const target = path.join(directory, 'after.png')
    await writeFile(target, Buffer.from('old screenshot'))
    state.spawn.mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
      queueMicrotask(() => child.emit('close', 1, null))
      return child
    })
    await expect(captureIosScreenshot(target, 'bound-device-uuid')).rejects.toThrow('iOS 截图失败')
    await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
