import type { NativePairEvidence, ReactNativeReport } from '../examples/react-native-expo/src/compatibility/protocol'
import fs from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it, vi } from 'vitest'
import { androidPairCoordinates } from './react-native/android-window'
import { captureNativePair, validateNativeArtifacts } from './react-native/pair-evidence'
import { createSemanticReporter } from './react-native/semantic-reporter'

function input(): NativePairEvidence {
  return {
    runId: 'run',
    platform: 'web',
    revision: 'baseline',
    id: 'background-color',
    phase: 'default',
    probe: { x: 0, y: 0, width: 40, height: 40 },
    reference: { x: 50, y: 0, width: 40, height: 40 },
    control: { x: 0, y: 50, width: 40, height: 40 },
    target: { x: 10, y: 10, width: 20, height: 20 },
    referenceTarget: { x: 60, y: 10, width: 20, height: 20 },
    controlTarget: { x: 10, y: 60, width: 20, height: 20 },
    viewport: { width: 100, height: 100, pixelRatio: 1 },
  }
}

function pixels() {
  const image = new PNG({ width: 100, height: 100 })
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data.set([226, 232, 240, 255], offset)
  }
  for (const left of [10, 60]) {
    for (let y = 10; y < 30; y++) {
      for (let x = left; x < left + 20; x++) {
        image.data.set([18, 52, 86, 255], (y * image.width + x) * 4)
      }
    }
  }
  return PNG.sync.write(image)
}

describe('原生宿主截图证据', () => {
  it.each([1, 2])('第 %i 帧迟到仍然失败，不写可接受的双帧回执', async (lateFrame) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-single-frame-'))
    const now = vi.spyOn(Date, 'now')
    try {
      now.mockReturnValue(0)
      const pair = input()
      let frames = 0
      const capture = vi.fn(async (name: string) => {
        const file = path.join(directory, name)
        await fs.writeFile(file, pixels())
        frames++
        now.mockReturnValue(frames === lateFrame ? 10_001 : 9_000)
        return file
      })
      await expect(captureNativePair(pair, { runId: pair.runId, artifacts: directory, capture })).rejects.toThrow(/two consecutive/)
      expect(capture).toHaveBeenCalledTimes(lateFrame)
      await expect(fs.stat(path.join(directory, 'case-baseline-background-color-default.png.json'))).rejects.toMatchObject({ code: 'ENOENT' })
      const diagnostic = JSON.parse(await fs.readFile(path.join(directory, 'case-baseline-background-color-default.png.capture.json'), 'utf8'))
      expect(diagnostic).toMatchObject({
        schemaVersion: 1,
        runId: pair.runId,
        revision: pair.revision,
        id: pair.id,
        phase: pair.phase,
        timeoutMs: 10_000,
        status: 'failed',
        stage: 'assess-screenshot',
      })
      expect(diagnostic.frames).toHaveLength(lateFrame)
      expect(diagnostic.frames.at(-1).checkpoints.every((item: { passed: boolean }) => item.passed)).toBe(true)
    }
    finally {
      now.mockRestore()
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it('第二帧挂起时取消仍同步保留首帧检查与在途阶段，迟到返回不能写回执', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-pending-frame-'))
    const pair = input()
    const controller = new AbortController()
    const filename = 'case-baseline-background-color-default.png'
    const file = path.join(directory, filename)
    await fs.writeFile(file, pixels())
    let release!: () => void
    let entered!: () => void
    const pending = new Promise<void>((resolve) => {
      entered = resolve
    })
    let frames = 0
    const capturing = captureNativePair(pair, {
      runId: pair.runId,
      artifacts: directory,
      cancelSignal: controller.signal,
      capture: async () => {
        if (++frames === 2) {
          entered()
          await new Promise<void>((resolve) => {
            release = resolve
          })
        }
        return file
      },
    })
    const outcome = capturing.catch(error => error as Error)
    try {
      await pending
      controller.abort(new Error('host capture exceeded 10000ms'))
      // 外层预算可能先返回，诊断必须在取消通知内落盘，不能依赖挂起截图完成。
      const diagnostic = JSON.parse(await fs.readFile(`${file}.capture.json`, 'utf8'))
      expect(diagnostic).toMatchObject({ status: 'failed', stage: 'capture-screenshot', consecutive: 1, error: 'Error: host capture exceeded 10000ms' })
      expect(diagnostic.frames).toHaveLength(2)
      expect(diagnostic.frames[0]).toMatchObject({ index: 1, consecutive: 1, byteLength: pixels().length })
      expect(diagnostic.frames[0].checkpoints.every((item: { passed: boolean }) => item.passed)).toBe(true)
      expect(diagnostic.frames[1]).toMatchObject({ index: 2 })
      expect(diagnostic.frames[1].capturedAtMs).toBeUndefined()
      release()
      expect(await outcome).toMatchObject({ message: 'host capture exceeded 10000ms' })
      await expect(fs.stat(`${file}.json`)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(JSON.parse(await fs.readFile(`${file}.capture.json`, 'utf8'))).toEqual(diagnostic)
    }
    finally {
      release?.()
      await outcome
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it('像素不通过的失败保留检查点，不能由末帧可见自动判为采集环境问题', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-rejected-frame-'))
    const now = vi.spyOn(Date, 'now').mockReturnValue(0)
    try {
      const pair = input()
      const image = PNG.sync.read(pixels())
      for (let y = 10; y < 30; y++) {
        for (let x = 10; x < 30; x++) {
          image.data.set([255, 0, 0, 255], (y * image.width + x) * 4)
        }
      }
      const file = path.join(directory, 'case-baseline-background-color-default.png')
      await fs.writeFile(file, PNG.sync.write(image))
      await expect(captureNativePair(pair, { runId: pair.runId, artifacts: directory, capture: async () => {
        now.mockReturnValue(10_001)
        return file
      } })).rejects.toThrow(/two consecutive/)
      const diagnostic = JSON.parse(await fs.readFile(`${file}.capture.json`, 'utf8'))
      expect(diagnostic).toMatchObject({ status: 'failed', stage: 'assess-screenshot', consecutive: 0 })
      expect(diagnostic.frames[0].checkpoints).toContainEqual(expect.objectContaining({ name: 'runtime:default:pixel', passed: false }))
      expect(diagnostic.frames[0].sha256).toMatch(/^[a-f\d]{64}$/)
      await expect(fs.stat(`${file}.json`)).rejects.toMatchObject({ code: 'ENOENT' })
    }
    finally {
      now.mockRestore()
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it('重读截图和坐标，拒绝被替换的字节与跨阶段 sidecar', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-artifact-'))
    try {
      const pair = input()
      const controller = new AbortController()
      const receipt = await captureNativePair(pair, { runId: pair.runId, artifacts: directory, cancelSignal: controller.signal, capture: async (name) => {
        const file = path.join(directory, name)
        await fs.writeFile(file, pixels())
        return file
      } })
      controller.abort(new Error('采集完成后的取消不能生成失败诊断'))
      await expect(fs.stat(path.join(directory, `${receipt.artifact.name}.capture.json`))).rejects.toMatchObject({ code: 'ENOENT' })
      const report = { runId: pair.runId, revision: pair.revision, receipts: [receipt] } as unknown as ReactNativeReport
      await expect(validateNativeArtifacts(report, directory)).resolves.toBeUndefined()
      const file = path.join(directory, receipt.artifact.name)
      const saved = await fs.readFile(`${file}.json`, 'utf8')
      await fs.writeFile(`${file}.json`, saved.replace('"revision": "baseline"', '"revision": "old"'))
      await expect(validateNativeArtifacts(report, directory)).rejects.toThrow(/stale/)
      await fs.writeFile(`${file}.json`, saved)
      await fs.appendFile(file, 'changed')
      await expect(validateNativeArtifacts(report, directory)).rejects.toThrow(/modified/)
      await fs.rm(file)
      await expect(validateNativeArtifacts(report, directory)).rejects.toThrow()
    }
    finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it('失败诊断落盘错误与原始采集错误同时暴露', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-diagnostic-write-'))
    try {
      const pair = input()
      const filename = 'case-baseline-background-color-default.png'
      await fs.mkdir(path.join(directory, `${filename}.capture.json`))
      const original = new Error('screenshot command failed')
      const failure = await captureNativePair(pair, { runId: pair.runId, artifacts: directory, capture: async () => {
        throw original
      } }).catch(error => error as AggregateError)
      expect(failure).toBeInstanceOf(AggregateError)
      expect((failure as AggregateError).errors).toEqual([original, expect.objectContaining({ code: expect.any(String) })])
      await expect(fs.stat(path.join(directory, `${filename}.json`))).rejects.toMatchObject({ code: 'ENOENT' })
    }
    finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it('用实际 Android 节点校准 inset，旧标签和裁剪不能复用', () => {
    const pair = input()
    const xml = '<node package="com.weapptailwindcss.rncompat" resource-id="tw-rn-case-probe" content-desc="background-color:default" bounds="[0,24][40,64]" />'
      + '<node package="com.weapptailwindcss.rncompat" resource-id="tw-rn-case-reference" content-desc="background-color:default" bounds="[50,24][90,64]" />'
      + '<node package="com.weapptailwindcss.rncompat" resource-id="tw-rn-case-control" content-desc="background-color:default" bounds="[0,74][40,114]" />'
    expect(androidPairCoordinates(xml, pair)).toMatchObject({ probe: { y: 24 }, target: { y: 34 }, referenceTarget: { y: 34 }, control: { y: 74 }, controlTarget: { y: 84 } })
    expect(() => androidPairCoordinates(xml.replaceAll(':default', ':old'), pair)).toThrow(/Missing current/)
    expect(() => androidPairCoordinates(xml.replace('[0,24][40,64]', '[0,24][40,60]'), pair)).toThrow(/Clipped/)
  })

  it('宿主只接受本轮已知用例并校验回执归属', async () => {
    const pair = input()
    const receipt = { runId: pair.runId, id: pair.id, phase: pair.phase, checkpoints: [], artifact: { name: 'test.png', sha256: 'a'.repeat(64), byteLength: 100 } }
    const capture = vi.fn(async () => receipt)
    const reporter = createSemanticReporter({ runId: pair.runId, fixtureHash: 'fixture', catalogHash: 'catalog', versions: {} }, capture, { clientToken: 'client', revision: pair.revision, platform: 'web' })
    const headers = { 'x-rn-e2e-client': 'client' }
    const server = createServer((request, response) => {
      if (!reporter.handle(request, response)) {
        response.writeHead(404).end()
      }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Missing test reporter address')
      }
      const endpoint = `http://127.0.0.1:${address.port}`
      expect(await (await fetch(`${endpoint}/context`, { headers })).json()).toMatchObject({ runId: pair.runId })
      const accepted = await fetch(`${endpoint}/case`, { method: 'POST', headers, body: JSON.stringify(pair) })
      expect(accepted.ok).toBe(true)
      const report = { runId: pair.runId, revision: pair.revision, platform: pair.platform, receipts: [receipt] } as unknown as ReactNativeReport
      expect(() => reporter.assertReceipts(report)).not.toThrow()
      expect(() => reporter.assertReceipts({ ...report, receipts: [{ ...receipt, phase: 'old' }] })).toThrow(/Missing host/)
      const stale = await fetch(`${endpoint}/case`, { method: 'POST', headers, body: JSON.stringify({ ...pair, runId: 'old' }) })
      expect(stale.status).toBe(409)
      expect(capture).toHaveBeenCalledOnce()
      expect(() => reporter.assertReady()).not.toThrow()
    }
    finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
