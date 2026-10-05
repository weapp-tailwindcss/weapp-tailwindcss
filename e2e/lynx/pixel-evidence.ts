import type { NativePlatformReport, StaticEvidenceReport } from '../../examples/react-lynx/src/compatibility/types'
import type { PngPixels } from './png'
import fs from 'node:fs/promises'
import path from 'node:path'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { evidenceSequence, requiresPixelEffect } from '../../examples/react-lynx/src/compatibility/evidence'
import staticEvidenceJson from '../../examples/react-lynx/src/compatibility/static-evidence.json'
import { evaluateColorScheme, validateColorSchemeReceipts } from './color-scheme'
import { evaluatePixelEffect } from './pixel-effects'
import { PNG } from './png'

const staticById = new Map((staticEvidenceJson as StaticEvidenceReport).results.map(item => [item.id, item]))

function hasVisibleDifference(first: PngPixels, second: PngPixels) {
  for (let offset = 0; offset < first.data.length; offset += 4) {
    const alpha = first.data[offset + 3]!
    if (alpha !== second.data[offset + 3]) {
      return true
    }
    // 完全透明的 RGB 不参与显示，编码器可保留不同的隐藏值。
    if (alpha !== 0 && (
      first.data[offset] !== second.data[offset]
      || first.data[offset + 1] !== second.data[offset + 1]
      || first.data[offset + 2] !== second.data[offset + 2]
    )) {
      return true
    }
  }
  return false
}

async function readPixels(file: string): Promise<PngPixels> {
  try {
    return PNG.sync.read(await fs.readFile(file))
  }
  catch (cause) {
    throw new Error(`缺失或无法解码的 Lynx 截图：${file}`, { cause })
  }
}

/** 仅处理原生采集端明确留待判定的效果，原始报告由 runner 单独保留。 */
export async function finalizeNativePixelEffects(raw: NativePlatformReport, cropsDirectory: string) {
  const report = structuredClone(raw)
  for (const result of report.results) {
    const built = staticById.get(result.id)
    if ((!requiresPixelEffect(result.id) && result.id !== 'variant-dark') || !built?.generated || !built.bundled) {
      continue
    }
    if (result.status !== 'not-tested') {
      throw new Error(`${result.id} 原始采集报告不能预先声明预期效果结论`)
    }
    if (result.id === 'variant-dark') {
      validateColorSchemeReceipts(result, report.evidence?.runId)
      const item = compatibilityCases.find(item => item.id === result.id)!
      const frames = evidenceSequence(item, built)!.frames
      const measured = evaluateColorScheme(await Promise.all(frames.map(frame => readPixels(path.join(cropsDirectory, `${result.id}-${frame}.png`)))))
      Object.assign(result, measured)
      if (measured.status === 'supported') {
        delete result.reason
        delete result.failureStage
      }
      continue
    }
    const [probe, control] = await Promise.all(['probe', 'control'].map(frame => readPixels(path.join(cropsDirectory, `${result.id}-${frame}.png`))))
    const measured = evaluatePixelEffect(result.id, probe!, control!)!
    const difference = { name: 'pixel:probe-vs-control', passed: hasVisibleDifference(probe!, control!) }
    Object.assign(result, measured)
    if (measured.status === 'supported') {
      delete result.reason
      delete result.failureStage
    }
    result.checkpoints = [difference, ...measured.checkpoints]
  }
  return report
}

/** 校验原始 PNG 对结论的必要支撑，不改写报告或自动更新基线。 */
export async function validateNativePixelEvidence(report: NativePlatformReport, cropsDirectory: string) {
  const resultById = new Map(report.results.map(result => [result.id, result]))
  const errors: Error[] = []
  for (const item of compatibilityCases) {
    const staticResult = staticById.get(item.id)
    const sequence = evidenceSequence(item, staticResult)
    if (!sequence) {
      continue
    }
    try {
      const result = resultById.get(item.id)
      const checkpoint = result?.checkpoints.find(checkpoint => checkpoint.name === sequence.checkpoint)
      if (!checkpoint) {
        throw new Error(`${report.platform}:${item.id} 缺少 ${sequence.checkpoint} checkpoint`)
      }
      const images = await Promise.all(sequence.frames.map(frame => readPixels(path.join(cropsDirectory, `${item.id}-${frame}.png`))))
      if (item.id === 'variant-dark') {
        validateColorSchemeReceipts(result!, report.evidence?.runId)
        const measured = evaluateColorScheme(images)
        const expected = measured.checkpoints[0]!
        if (result?.status !== measured.status || result.reason !== measured.reason || result.failureStage !== measured.failureStage
          || result.checkpoints.length !== 1 || Object.entries(expected).some(([key, value]) => checkpoint[key as keyof typeof expected] !== value)) {
          throw new Error(`${report.platform}:${item.id} 颜色模式结论与四帧像素不符`)
        }
        continue
      }
      for (let index = 1; index < images.length; index++) {
        const before = images[index - 1]!
        const after = images[index]!
        const pair = `${report.platform}:${item.id} ${sequence.frames[index - 1]} ${before.width}x${before.height} -> ${sequence.frames[index]} ${after.width}x${after.height}`
        // 一像素宽度变化也会改变渐变插值；裁剪或缩放会制造新的差异。
        if (before.width !== after.width || before.height !== after.height) {
          throw new Error(`${pair} 截图尺寸不一致，无法比较可见像素；请使用相同大小的捕获区域`)
        }
        // 未通过的交互可能源于输入注入失败，不能仅凭截图替它推断支持。
        if (checkpoint.passed && !hasVisibleDifference(before, after)) {
          throw new Error(
            `${pair} 没有可见像素变化，PNG 编码差异不能支撑通过结论`,
          )
        }
      }
      const measured = evaluatePixelEffect(item.id, images[0]!, images[1]!)
      if (measured) {
        const expected = measured.checkpoints[0]!
        const recorded = result?.checkpoints.filter(value => value.name === expected.name)
        if (result?.status !== measured.status || result.reason !== measured.reason || result.failureStage !== measured.failureStage
          || recorded?.length !== 1 || Object.entries(expected).some(([key, value]) => recorded[0]![key as keyof typeof expected] !== value)
          || checkpoint.passed !== hasVisibleDifference(images[0]!, images[1]!)) {
          throw new Error(`${report.platform}:${item.id} 预期效果结论与原始像素不符`)
        }
      }
    }
    catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, `Lynx 像素证据无效：\n${errors.map(error => error.message).join('\n')}`)
  }
}
