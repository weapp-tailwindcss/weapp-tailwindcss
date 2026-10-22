import type { Buffer } from 'node:buffer'
import type { NativePairEvidence, ReactNativeReport } from '../examples/react-native-expo/src/compatibility/protocol'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it, vi } from 'vitest'
import { syntheticRuntimeInstallation } from './react-native/installation-fixture'
import { captureNativePair, validateNativeArtifacts } from './react-native/pair-evidence'
import { captureWebScreenshot } from './react-native/web-capture'

function fixture() {
  const pair: NativePairEvidence = {
    runtimeInstallation: syntheticRuntimeInstallation(),
    runId: 'unit',
    revision: 'baseline',
    platform: 'web',
    id: 'background-color',
    phase: 'default',
    probe: { x: 0, y: 0, width: 32, height: 32 },
    reference: { x: 32, y: 0, width: 32, height: 32 },
    control: { x: 0, y: 32, width: 32, height: 32 },
    target: { x: 4, y: 4, width: 24, height: 24 },
    referenceTarget: { x: 36, y: 4, width: 24, height: 24 },
    controlTarget: { x: 4, y: 36, width: 24, height: 24 },
    viewport: { width: 64, height: 64, pixelRatio: 1 },
  }
  const image = new PNG({ width: 64, height: 64 })
  for (let i = 0; i < image.data.length; i += 4) {
    image.data.set([226, 232, 240, 255], i)
  }
  for (const left of [4, 36]) {
    for (let y = 4; y < 28; y++) {
      for (let x = left; x < left + 24; x++) {
        image.data.set([18, 52, 86, 255], (y * 64 + x) * 4)
      }
    }
  }
  return { pair, image, png: PNG.sync.write(image) }
}

async function withCapture(action: (context: { directory: string, pair: NativePairEvidence, png: Buffer, image: PNG }) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-two-frame-'))
  try {
    await action({ directory, ...fixture() })
  }
  finally {
    vi.restoreAllMocks()
    await fs.rm(directory, { recursive: true, force: true })
  }
}

describe('连续帧原件与真实截图', () => {
  it('相同字节仍截图两次并保留两份原件，仅复用同 pair 上一帧的计算', () => withCapture(async ({ directory, pair, png }) => {
    const read = vi.spyOn(PNG.sync, 'read')
    const capture = vi.fn(async (name: string) => {
      const filename = path.join(directory, name)
      await fs.writeFile(filename, png)
      return filename
    })
    const receipt = await captureNativePair(pair, { runId: pair.runId, artifacts: directory, capture })
    expect(capture).toHaveBeenCalledTimes(2)
    expect(read).toHaveBeenCalledTimes(1)
    expect(receipt.capture.frames).toHaveLength(2)
    expect(receipt.capture.frames[1]!.assessmentReusedFromFrame).toBe(1)
    expect(receipt.capture.frames[1]!.decodedAtMs).toBeUndefined()
    expect(new Set(receipt.capture.frames.map(frame => frame.artifact.name)).size).toBe(2)
    for (const frame of receipt.capture.frames) {
      expect(await fs.readFile(path.join(directory, frame.artifact.name))).toEqual(png)
    }
    const report = { runtimeInstallation: syntheticRuntimeInstallation(), runId: pair.runId, revision: pair.revision, platform: pair.platform, receipts: [receipt] } as ReactNativeReport
    await validateNativeArtifacts(report, directory)
    expect(read).toHaveBeenCalledTimes(3)
    const first = path.join(directory, receipt.capture.frames[0]!.artifact.name)
    await fs.appendFile(first, 'tampered')
    await expect(validateNativeArtifacts(report, directory)).rejects.toThrow(/modified/)
    await fs.rm(first)
    await expect(validateNativeArtifacts(report, directory)).rejects.toThrow()
  }))

  it('旧单帧或非连续回执即使最终截图有效也拒绝', () => withCapture(async ({ directory, pair, png }) => {
    const receipt = await captureNativePair(pair, { runId: pair.runId, artifacts: directory, capture: async (name) => {
      const filename = path.join(directory, name)
      await fs.writeFile(filename, png)
      return filename
    } })
    const report = { runtimeInstallation: syntheticRuntimeInstallation(), runId: pair.runId, revision: pair.revision, receipts: [receipt] } as ReactNativeReport
    const sidecar = path.join(directory, `${receipt.artifact.name}.json`)
    const original = structuredClone(receipt)
    for (const invalid of [undefined, { ...original.capture, frames: [original.capture.frames[1]] }, { ...original.capture, frames: original.capture.frames.map((frame, i) => ({ ...frame, index: i + 2 })) }]) {
      Object.assign(receipt, { capture: invalid })
      await fs.writeFile(sidecar, JSON.stringify({ pair, receipt }))
      await expect(validateNativeArtifacts(report, directory)).rejects.toThrow(/frame|capture/i)
    }
  }))

  it('仅 ROI 外一个字节变化也重新解码，不以局部像素或 hash 近似复用', () => withCapture(async ({ directory, pair, image, png }) => {
    image.data[(63 * 64 + 63) * 4] = 1
    const changed = PNG.sync.write(image)
    const read = vi.spyOn(PNG.sync, 'read')
    let count = 0
    const receipt = await captureNativePair(pair, { runId: pair.runId, artifacts: directory, capture: async (name) => {
      const filename = path.join(directory, name)
      await fs.writeFile(filename, ++count === 1 ? png : changed)
      return filename
    } })
    expect(read).toHaveBeenCalledTimes(2)
    expect(receipt.capture.frames[1]!.assessmentReusedFromFrame).toBeUndefined()
  }))

  it('A通过、B失败、A通过不能凑成连续两帧；失败结果相同也不变为通过', () => withCapture(async ({ directory, pair, image, png }) => {
    for (let y = 4; y < 28; y++) {
      for (let x = 4; x < 28; x++) {
        image.data.set([255, 0, 0, 255], (y * 64 + x) * 4)
      }
    }
    const failed = PNG.sync.write(image)
    const sequence = [png, failed, failed, png, png]
    const capture = vi.fn(async (name: string) => {
      const filename = path.join(directory, name)
      await fs.writeFile(filename, sequence[capture.mock.calls.length - 1]!)
      return filename
    })
    const receipt = await captureNativePair(pair, { runId: pair.runId, artifacts: directory, capture })
    expect(capture).toHaveBeenCalledTimes(5)
    expect(receipt.capture.frames.map(frame => frame.checkpoints.every(check => check.passed))).toEqual([true, false, false, true, true])
    expect(receipt.capture.frames[2]!.assessmentReusedFromFrame).toBe(2)
    expect(receipt.capture.frames[3]!.assessmentReusedFromFrame).toBeUndefined()
  }))

  it('Web 不可取消截图迟到时不能写入产物', () => withCapture(async ({ directory, png }) => {
    const controller = new AbortController()
    let release!: (bytes: Buffer) => void
    const screenshot = vi.fn(() => new Promise<Buffer>((resolve) => {
      release = resolve
    }))
    const filename = path.join(directory, 'late.png')
    const capturing = captureWebScreenshot({ screenshot } as unknown as Parameters<typeof captureWebScreenshot>[0], filename, controller.signal)
    const failed = expect(capturing).rejects.toThrow('capture cancelled')
    controller.abort(new Error('capture cancelled'))
    release(png)
    await failed
    expect(screenshot).toHaveBeenCalledWith()
    await expect(fs.stat(filename)).rejects.toMatchObject({ code: 'ENOENT' })
  }))

  it('缓存不跨 pair 或 revision；下一阶段仍重新解码第一帧', () => withCapture(async ({ directory, pair, png }) => {
    const read = vi.spyOn(PNG.sync, 'read')
    const capture = vi.fn(async (name: string) => {
      const file = path.join(directory, name)
      await fs.writeFile(file, png)
      return file
    })
    await captureNativePair(pair, { runId: pair.runId, artifacts: directory, capture })
    await captureNativePair({ ...pair, revision: 'next' }, { runId: pair.runId, artifacts: directory, capture })
    expect(capture).toHaveBeenCalledTimes(4)
    expect(read).toHaveBeenCalledTimes(2)
  }))
})
