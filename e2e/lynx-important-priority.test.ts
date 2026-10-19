import type { NativePlatformReport } from '../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { compatibilityCases } from '../examples/react-lynx/src/compatibility/catalog'
import { evidenceSequence, requiresPixelEffect } from '../examples/react-lynx/src/compatibility/evidence'
import { importantImage } from './lynx/fixtures/important-images'
import { evaluateImportantPriority } from './lynx/important-priority'
import { finalizeNativePixelEffects, validateNativePixelEvidence } from './lynx/pixel-evidence'
import { PNG } from './lynx/png'

vi.mock('../examples/react-lynx/src/compatibility/static-evidence.json', () => ({ default: { results: [{ id: 'syntax-important', generated: true, bundled: true }] } }))

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

function images(scale = 1) {
  return [importantImage(scale), importantImage(scale, 'red'), importantImage(scale)]
}

it.each([1, 2, 3])('scale=%i 的优先级只在灰probe、红普通竞争组、灰参考同时成立时通过', (scale) => {
  expect(evaluateImportantPriority(images(scale))).toMatchObject({ status: 'supported', checkpoints: [{ passed: true, name: 'pixel:important-priority-v1' }] })
})

it('移除 important 的反事实呈普通竞争红，只能得到优先级不支持', () => {
  const frames = images()
  frames[0] = importantImage(1, 'red')
  expect(evaluateImportantPriority(frames)).toMatchObject({ status: 'unsupported', failureStage: 'runtime', checkpoints: [{ passed: false }] })
})

it.each(['gray-control', 'red-reference', 'wrong-probe', 'transparent', 'wrong-canvas', 'partial-probe', 'missing-frame', 'wrong-size'])('%s 不能成为通过或平台不支持的证据', (mode) => {
  const frames = images()
  if (mode === 'gray-control') {
    frames[1] = importantImage()
  }
  if (mode === 'red-reference') {
    frames[2] = importantImage(1, 'red')
  }
  if (mode === 'wrong-probe') {
    frames[0] = importantImage(1, 'blue')
  }
  if (mode === 'transparent') {
    frames[0]!.data[(40 * 160 + 40) * 4 + 3] = 0
  }
  if (mode === 'wrong-canvas') {
    frames[0]!.data[0] = 0
  }
  if (mode === 'partial-probe') {
    frames[0]!.data[(40 * 160 + 40) * 4] = 0
  }
  if (mode === 'missing-frame') {
    frames.pop()
  }
  if (mode === 'wrong-size') {
    frames[0] = importantImage(2)
  }
  expect(() => evaluateImportantPriority(frames)).toThrow(/important/)
})

it('important 必须由宿主核对普通竞争者和参考帧，不能仅接受颜色变化', () => {
  const item = compatibilityCases.find(item => item.id === 'syntax-important')!
  expect(requiresPixelEffect(item.id)).toBe(true)
  expect(evidenceSequence(item, { generated: true, bundled: true })).toEqual({ checkpoint: 'pixel:important-priority-v1', frames: ['probe', 'control', 'reference'] })
})

it('important 原始采集报告不能因灰色截图提前自报支持', async () => {
  const raw = { results: [{ id: 'syntax-important', status: 'supported', checkpoints: [] }] } as unknown as NativePlatformReport
  await expect(finalizeNativePixelEffects(raw, 'unused-before-capture')).rejects.toThrow(/原始采集报告不能预先声明/)
})

it('宿主从全部 PNG 重算优先级，已通过报告不能靠旧checkpoint掩盖失效竞争组', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-important-'))
  directories.push(directory)
  for (const [index, frame] of ['probe', 'control', 'reference'].entries()) {
    await fs.writeFile(path.join(directory, `syntax-important-${frame}.png`), PNG.sync.write(images()[index]!))
  }
  const raw = { platform: 'android', results: [{ id: 'syntax-important', status: 'not-tested', checkpoints: [] }] } as unknown as NativePlatformReport
  const report = await finalizeNativePixelEffects(raw, directory)
  expect(report.results[0]).toMatchObject({ status: 'supported' })
  await expect(validateNativePixelEvidence(report, directory)).resolves.toBeUndefined()
  await fs.writeFile(path.join(directory, 'syntax-important-control.png'), PNG.sync.write(importantImage()))
  await expect(validateNativePixelEvidence(report, directory)).rejects.toThrow(/普通竞争规则/)
})
