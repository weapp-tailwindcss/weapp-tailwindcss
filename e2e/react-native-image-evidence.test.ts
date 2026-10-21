import type { NativePairEvidence } from '../examples/react-native-expo/src/compatibility/protocol'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { syntheticRuntimeInstallation } from './react-native/installation-fixture'
import { assessNativePair } from './react-native/pair-assessment'
import { captureNativePair, validateNativeArtifacts } from './react-native/pair-evidence'
import { validateReactNativeReport } from './react-native/reports'
import { writeRuntimeFixture } from './react-native/runtime-fixture'

const uri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAYAAADwdn+XAAAALklEQVR4AaXBQQEAIAzEsHJi5gIBCMfFvICDfZqsrnoMzr5MghSkIAUpSEEK0gfgKgOCJP8ROwAAAABJRU5ErkJggg=='

/** 合成输入只用于判定器反例，不作为设备加载或截图证据。 */
function fixture() {
  const pair = {
    runtimeInstallation: syntheticRuntimeInstallation(),
    runId: 'run',
    platform: 'web',
    revision: 'baseline',
    id: 'sizing-size',
    phase: 'image',
    probe: { x: 0, y: 0, width: 160, height: 128 },
    reference: { x: 0, y: 136, width: 160, height: 128 },
    control: { x: 0, y: 272, width: 160, height: 128 },
    target: { x: 16, y: 16, width: 44, height: 44 },
    referenceTarget: { x: 16, y: 152, width: 44, height: 44 },
    controlTarget: { x: 16, y: 288, width: 80, height: 40 },
    viewport: { width: 160, height: 400, pixelRatio: 1 },
    image: { version: 1, loads: ['probe', 'reference', 'control'].map(side => ({ side, revision: 'baseline', id: 'sizing-size', phase: 'image', event: 'load', origin: 'web-target', uri, width: 16, height: 8 })) },
  } as NativePairEvidence & { image: { version: number, loads: Array<Record<string, unknown>> } }
  const image = new PNG({ width: 160, height: 400 })
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data.set([226, 232, 240, 255], offset)
  }
  for (const rect of [pair.target, pair.referenceTarget, pair.controlTarget]) {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        image.data.set(x < rect.x + rect.width / 2 ? [220, 38, 38, 255] : [37, 99, 235, 255], (y * image.width + x) * 4)
      }
    }
  }
  return { pair, image }
}

function passes(input: ReturnType<typeof fixture>) {
  return assessNativePair(input.image, input.pair).every(checkpoint => checkpoint.passed)
}

describe('Image 真实组件的独立 oracle', () => {
  it('接受加载证据、绝对尺寸与双色像素同时成立的合成输入', () => {
    expect(passes(fixture())).toBe(true)
  })

  it.each(['missing', 'duplicate', 'phase', 'revision', 'uri', 'size', 'origin', 'loadend'])('拒绝 %s 加载证据', (mutation) => {
    const input = fixture()
    const loads = input.pair.image.loads
    if (mutation === 'missing') {
      loads.pop()
    }
    if (mutation === 'duplicate') {
      loads[2] = { ...loads[0] }
    }
    if (mutation === 'phase') {
      loads[0]!.phase = 'default'
    }
    if (mutation === 'revision') {
      loads[0]!.revision = 'old'
    }
    if (mutation === 'uri') {
      loads[0]!.uri = 'data:image/png;base64,wrong'
    }
    if (mutation === 'size') {
      loads[0]!.width = 44
    }
    if (mutation === 'origin') {
      loads[0]!.origin = 'native-source'
    }
    if (mutation === 'loadend') {
      loads[0]!.event = 'loadend'
    }
    expect(() => assessNativePair(input.image, input.pair)).toThrow(/Image/)
  })

  it('参考与探针同时错误也不能由相对比较放行', () => {
    const input = fixture()
    input.pair.target.width = input.pair.referenceTarget.width = 43
    expect(passes(input)).toBe(false)
  })

  it('测量尺寸正确但图像画到边界外也必须失败', () => {
    const input = fixture()
    for (const rect of [input.pair.target, input.pair.referenceTarget]) {
      input.image.data.set([37, 99, 235, 255], (Math.round(rect.y + rect.height / 2) * input.image.width + rect.x + rect.width + 2) * 4)
    }
    expect(passes(input)).toBe(false)
  })

  it.each(['probe', 'reference', 'control'] as const)('拒绝 %s 被替换为单色图', (side) => {
    const input = fixture()
    const rect = side === 'probe' ? input.pair.target : side === 'reference' ? input.pair.referenceTarget : input.pair.controlTarget
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        input.image.data.set([220, 38, 38, 255], (y * input.image.width + x) * 4)
      }
    }
    expect(passes(input)).toBe(false)
  })

  it('生产重放重新读取加载原件；已通过的截图不能替代缺失事件', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'rn-image-replay-'))
    try {
      const input = fixture()
      const receipt = await captureNativePair(input.pair, { runId: 'run', artifacts: directory, capture: async (name) => {
        const file = path.join(directory, name)
        await writeFile(file, PNG.sync.write(input.image))
        return file
      } })
      const report = { runtimeInstallation: input.pair.runtimeInstallation, platform: 'web', runId: 'run', revision: 'baseline', receipts: [receipt] } as Parameters<typeof validateNativeArtifacts>[0]
      await expect(validateNativeArtifacts(report, directory)).resolves.toBeUndefined()
      const file = path.join(directory, `${receipt.artifact.name}.json`)
      const saved = JSON.parse(await readFile(file, 'utf8'))
      delete saved.pair.image
      await writeFile(file, JSON.stringify(saved))
      await expect(validateNativeArtifacts(report, directory)).rejects.toThrow(/Image/)
    }
    finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('旧报告补上当前 hash 仍不能省略 image phase', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'rn-image-missing-'))
    try {
      const report = await writeRuntimeFixture(directory, 'web', 'run', new Date().toISOString())
      expect(() => validateReactNativeReport(report)).not.toThrow()
      report.receipts = report.receipts.filter(receipt => receipt.phase !== 'image')
      report.results.find(result => result.id === 'sizing-size')!.checkpoints = report.results.find(result => result.id === 'sizing-size')!.checkpoints.filter(checkpoint => !checkpoint.name.startsWith('runtime:image:'))
      expect(() => validateReactNativeReport(report)).toThrow(/image/)
    }
    finally { await rm(directory, { recursive: true, force: true }) }
  })
})
