import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitForAndroidRuntimeEvidence } from './hbuilderx-local/android-runtime'

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawnSync: mocks.spawn,
}))

const marker = 'current-marker'
const bounds = '[0,0][173,41]'
const deviceId = 'test-current-device'
const node = (text: string, nodeBounds = bounds, extra = '') => `<hierarchy><node text="${text}" bounds="${nodeBounds}" ${extra}/></hierarchy>`

function png(version: number, outsideVersion = 0, filterType = -1, width = 180, height = 41) {
  const image = new PNG({ width, height })
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = 16
    image.data[index + 1] = 41
    image.data[index + 2] = 56
    image.data[index + 3] = 255
  }
  image.data[0] = version
  image.data[173 * 4] = outsideVersion
  return PNG.sync.write(image, { filterType })
}

describe('Android marker 与截图属于同一次稳定采样', () => {
  let root: string
  let samples: string[]
  let remoteFiles: Map<string, string>
  let events: string[]
  let dumps: number
  let screenshots: number
  let visibleVersion: number
  let failDump: number | undefined
  let failScreenshot: boolean
  let screenshotImage: Buffer | undefined

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'android-runtime-sampling-'))
    samples = [node(marker), node(marker)]
    remoteFiles = new Map([['/sdcard/window.xml', 'unrelated old dump']])
    events = []
    dumps = 0
    screenshots = 0
    visibleVersion = 0
    failDump = undefined
    failScreenshot = false
    screenshotImage = undefined
    mocks.spawn.mockReset().mockImplementation((_command: string, args: string[]) => {
      const success = (stdout: string | Buffer = '') => ({ status: 0, signal: null, stdout, stderr: '' })
      if (args[0] === 'version') {
        return success('Android Debug Bridge')
      }
      expect(args.slice(0, 2)).toEqual(['-s', deviceId])
      if (args[2] === 'exec-out') {
        expect(args.slice(3)).toEqual(['screencap', '-p'])
        screenshots++
        events.push(`screenshot:${visibleVersion}`)
        return failScreenshot ? { ...success(Buffer.alloc(0)), status: 1, stderr: Buffer.from('screencap failed') } : success(screenshotImage ?? png(visibleVersion))
      }
      expect(args[2]).toBe('shell')
      const command = args[3]
      const file = args.at(-1)!
      if (command === 'wm') {
        return success('Physical density: 160')
      }
      if (command === 'uiautomator') {
        dumps++
        events.push(`dump:${dumps}`)
        if (dumps === failDump) {
          return { ...success(), status: 1, stderr: 'dump failed during capture' }
        }
        remoteFiles.set(file, samples[Math.min(dumps - 1, samples.length - 1)]!)
        return success('dumped')
      }
      if (command === 'cat') {
        events.push(`read:${dumps}`)
        visibleVersion = dumps
        return success(remoteFiles.get(file)!)
      }
      if (command === 'rm') {
        remoteFiles.delete(file)
        return success()
      }
      if (command === 'pidof') {
        return success('')
      }
      if (command === 'input') {
        events.push('scroll')
        return success()
      }
      throw new Error(`不允许的设备命令：${args.join(' ')}`)
    })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  function capture(maxAttempts = 3, previousScreenshot?: string) {
    let attempts = 0
    return waitForAndroidRuntimeEvidence({
      deviceId,
      ensureRunning() {
        if (++attempts > maxAttempts) {
          throw new Error('运行已终止，仍未取得稳定采样')
        }
      },
      env: {},
      expectation: { backgroundColor: '#102938', height: 41, markerText: marker, width: 173 },
      label: 'Android sampling',
      screenshot: path.join(root, 'current.png'),
      ...(previousScreenshot ? { previousScreenshot } : {}),
      timeoutMs: 10_000,
    })
  }

  function expectNoOwnedDeviceFiles() {
    expect([...remoteFiles]).toEqual([['/sdcard/window.xml', 'unrelated old dump']])
  }

  it('先等待 UI marker，再捕获对应画面，拒绝旧截图与新 UI 拼接', async () => {
    const evidence = await capture()
    expect(events.slice(0, 5)).toEqual(['dump:1', 'read:1', 'screenshot:1', 'dump:2', 'read:2'])
    expect(await readFile(evidence.screenshot)).toEqual(png(1))
    expect(evidence.markerTextVisible).toBe(true)
    expect(evidence.markerBounds).toEqual({ minX: 0, minY: 0, maxX: 172, maxY: 40 })
    expectNoOwnedDeviceFiles()
  })

  it('旧 marker 尚未切换时不截图，等到新 marker 稳定才返回', async () => {
    samples = [node('old-marker'), node(marker), node(marker)]
    const evidence = await capture()
    expect(screenshots).toBe(1)
    expect(events.indexOf('screenshot:2')).toBeGreaterThan(events.indexOf('read:2'))
    expect(await readFile(evidence.screenshot)).toEqual(png(2))
    expectNoOwnedDeviceFiles()
  })

  it('content-desc 精确命中的稳定 marker 可作为本轮证据', async () => {
    samples = [node('', bounds, `content-desc="${marker}"`)]
    const evidence = await capture()
    expect(evidence.markerTextVisible).toBe(true)
    expect(evidence.markerBounds).toEqual({ minX: 0, minY: 0, maxX: 172, maxY: 40 })
    expectNoOwnedDeviceFiles()
  })

  it.each([
    { name: 'marker 消失', changed: node('old-marker') },
    { name: 'marker 文本变化', changed: node(`${marker}-next`) },
    { name: 'marker 边界移动', changed: node(marker, '[1,0][174,41]') },
  ])('截图过程中 $name 时丢弃该次采样', async ({ changed }) => {
    samples = [node(marker), changed, node(marker), node(marker)]
    const evidence = await capture()
    expect(screenshots).toBe(2)
    expect(await readFile(evidence.screenshot)).toEqual(png(3))
    expectNoOwnedDeviceFiles()
  })

  it.each([
    { name: '仅 XML 其他属性含 marker', xml: node('old-marker', bounds, `resource-id="${marker}"`) },
    { name: '相似 marker 前缀', xml: node(`${marker}-previous`) },
    { name: 'marker 缺少 bounds', xml: `<hierarchy><node text="${marker}" /></hierarchy>` },
    { name: 'marker 的 bounds 没有面积', xml: node(marker, '[0,0][0,0]') },
  ])('$name 不能退回全屏颜色来接受证据', async ({ xml }) => {
    samples = [xml]
    await expect(capture(1)).rejects.toThrow('未取得稳定采样')
    expect(screenshots).toBe(0)
    expectNoOwnedDeviceFiles()
  })

  it('截图后 UI 采集失败直接拒绝，并回收前后两次设备文件', async () => {
    failDump = 2
    await expect(capture()).rejects.toThrow('dump failed during capture')
    expect(screenshots).toBe(1)
    expectNoOwnedDeviceFiles()
  })

  it('截图失败不继续接受或复用旧画面，前置 UI 文件仍回收', async () => {
    failScreenshot = true
    await expect(capture()).rejects.toThrow('screencap failed')
    expect(dumps).toBe(1)
    expectNoOwnedDeviceFiles()
  })

  it.each([
    { name: '仅 marker 外滚动条像素改变', current: png(1, 255) },
    { name: '仅 PNG 编码改变', current: png(1, 0, 0) },
  ])('$name 不能证明 HMR 画面更新', async ({ current }) => {
    const previous = png(1)
    expect(current).not.toEqual(previous)
    screenshotImage = current
    const previousFile = path.join(root, 'previous.png')
    await writeFile(previousFile, previous)
    await expect(capture(1, previousFile)).rejects.toThrow('未取得稳定采样')
    expectNoOwnedDeviceFiles()
  })

  it('marker 内真实 RGBA 像素变化可证明更新', async () => {
    screenshotImage = png(2)
    const previousFile = path.join(root, 'previous.png')
    await writeFile(previousFile, png(1))
    expect((await capture(1, previousFile)).screenshotChanged).toBe(true)
    expectNoOwnedDeviceFiles()
  })

  it.each([{ width: 181, height: 41 }, { width: 180, height: 42 }])('前后截图尺寸不一致 $width × $height 时拒绝证据', async ({ width, height }) => {
    screenshotImage = png(2)
    const previousFile = path.join(root, 'previous.png')
    await writeFile(previousFile, png(1, 0, -1, width, height))
    await expect(capture(1, previousFile)).rejects.toThrow('未取得稳定采样')
    expectNoOwnedDeviceFiles()
  })

  it.each(['[-1,0][172,41]', '[8,0][181,41]', '[0,-1][173,40]', '[0,1][173,42]'])('marker 越界 %s 时不能通过裁切或全屏颜色回退放行', async (invalidBounds) => {
    samples = [node(marker, invalidBounds)]
    await expect(capture(1)).rejects.toThrow('未取得稳定采样')
    expectNoOwnedDeviceFiles()
  })
})
