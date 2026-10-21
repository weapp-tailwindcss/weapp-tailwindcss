import type { NativePlatformReport } from '../examples/react-lynx/src/compatibility/types'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { evaluateGeometry } from '../examples/react-lynx/src/compatibility/geometry'
import { readNativeHostGeometry } from './lynx/geometry-evidence'
import { PNG } from './lynx/png'

const owned: string[] = []
const context = { version: 1 as const, runId: '00000000-0000-4000-8000-000000000001', bundleSha256: 'a'.repeat(64) }
const id = 'sizing-fixed'
afterEach(async () => {
  await Promise.all(owned.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

function image(scale: number, width: number, height: number) {
  const png = new PNG({ width: Math.round(160 * scale), height: Math.round(96 * scale) })
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const cssX = (x + 0.5) / scale
      const cssY = (y + 0.5) / scale
      const body = cssX >= 8 && cssX < 8 + width && cssY >= 8 && cssY < 8 + height
      const marker = body && cssX >= 12 && cssX < 16 && cssY >= 12 && cssY < 16
      png.data.set(marker ? [249, 115, 22, 255] : body ? [37, 99, 235, 255] : [255, 255, 255, 255], (y * png.width + x) * 4)
    }
  }
  return PNG.sync.write(png)
}

async function fixture(scale = 3, paintedHeight = 22.5, platform: 'ios' | 'android' = 'ios') {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'lynx-fixed-size-'))
  owned.push(directory)
  const geometry = {
    probeContainer: rect(10, 20, 160, 96),
    controlContainer: rect(200, 300, 160, 96),
    probe: rect(18, 28, 123, 22.5),
    control: rect(208, 308, 80, 64),
    probeChild: rect(22, 32, 4, 4),
    controlChild: rect(212, 312, 4, 4),
  }
  const screenMetrics = { version: 1, source: 'lynx-native-screen-v1', width: 375, height: 812, pixelRatio: scale }
  const environmentScale = platform === 'android' ? scale : 1
  const raw = {
    platform,
    environment: { viewport: { width: 375 * environmentScale, height: 812 * environmentScale, pixelRatio: scale } },
    results: [{ id, status: 'supported', geometry, screenMetrics }],
    evidence: { ...context, artifacts: [] },
  } as unknown as NativePlatformReport
  const sidecar = { ...context, source: 'lynx-native-host-geometry-v1', id, platform, geometry: structuredClone(geometry), screenMetrics: structuredClone(screenMetrics) }
  await fs.writeFile(path.join(directory, `${id}-geometry-probe.png`), image(scale, 123, paintedHeight))
  await fs.writeFile(path.join(directory, `${id}-geometry-control.png`), image(scale, 80, 64))
  async function persist() {
    await fs.writeFile(path.join(directory, `${id}-geometry.json`), JSON.stringify(sidecar))
    raw.evidence!.artifacts = await Promise.all(['probe.png', 'control.png', '.json'].map(async (suffix) => {
      const name = suffix.startsWith('.') ? `${id}-geometry${suffix}` : `${id}-geometry-${suffix}`
      const bytes = await fs.readFile(path.join(directory, name))
      return { runId: context.runId, name, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
    }))
  }
  await persist()
  const read = () => readNativeHostGeometry(raw, directory, context, id)
  return { raw, sidecar, directory, persist, read }
}

it.each([1, 2.625, 3])('宿主侧车与两张 %s 倍 PNG 独立重放完整宽高', async (scale) => {
  const { raw, read } = await fixture(scale)
  const geometry = await read()
  expect(evaluateGeometry({ id } as never, geometry, raw.results[0]!.screenMetrics).status).toBe('supported')
})

it.each([1, 2.625, 3])('Android 的 %s 倍物理屏幕必须先转换为宿主 CSS 单位', async (scale) => {
  const { raw, read } = await fixture(scale, 22.5, 'android')
  expect(raw.environment.viewport.width).toBe(375 * scale)
  const geometry = await read()
  expect(evaluateGeometry({ id } as never, geometry, raw.results[0]!.screenMetrics).status).toBe('supported')
})

it('Android 报告不能混用 iOS 逻辑屏幕单位', async () => {
  const test = await fixture(3, 22.5, 'android')
  test.raw.environment.viewport.width = 375
  await expect(test.read()).rejects.toThrow(/screen/)
})

it.each(['missing', 'width', 'height', 'pixelRatio', 'source', 'version'] as const)('拒绝 %s screen 参数，即使重签本轮侧车哈希', async (mode) => {
  const test = await fixture()
  if (mode === 'missing') {
    delete (test.sidecar as Partial<typeof test.sidecar>).screenMetrics
  }
  else if (mode === 'source') {
    test.sidecar.screenMetrics.source = 'js-SystemInfo'
  }
  else {
    test.sidecar.screenMetrics[mode] += 1
  }
  await test.persist()
  await expect(test.read()).rejects.toThrow(/screen/)
})

it('报告和侧车一起改 screen 也不能与真实环境冲突', async () => {
  const test = await fixture()
  test.sidecar.screenMetrics.width = 320
  test.raw.results[0]!.screenMetrics!.width = 320
  await test.persist()
  await expect(test.read()).rejects.toThrow(/screen/)
})

it.each([40, 45, 64])('旧 PNG 仍为 %s 高时，改报告和侧车也不能冒充正确高度', async (height) => {
  const test = await fixture(3, height)
  await expect(test.read()).rejects.toThrow(/截图/)
})

it.each(['runId', 'bundleSha256'] as const)('旧 %s 的侧车不能通过', async (field) => {
  const test = await fixture()
  test.sidecar[field] = 'old'
  await test.persist()
  await expect(test.read()).rejects.toThrow(/身份/)
})

it('缺失一份实际截图或旧截图字节都会拒绝', async () => {
  const test = await fixture()
  await fs.writeFile(path.join(test.directory, `${id}-geometry-control.png`), image(3, 80, 40))
  await expect(test.read()).rejects.toThrow(/字节/)
  await fs.rm(path.join(test.directory, `${id}-geometry-probe.png`))
  await expect(test.read()).rejects.toThrow()
})
