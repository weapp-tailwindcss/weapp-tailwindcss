import type { NativePlatformReport, StaticEvidenceReport } from '../../examples/react-lynx/src/compatibility/types'
import type { PngPixels } from './png'
import fs from 'node:fs/promises'
import path from 'node:path'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import staticEvidenceJson from '../../examples/react-lynx/src/compatibility/static-evidence.json'
import { PNG } from './png'

const staticById = new Map((staticEvidenceJson as StaticEvidenceReport).results.map(item => [item.id, item]))
const interactionSequences: Record<string, { checkpoint: string, frames: string[] }> = {
  'variant-state': { checkpoint: 'interaction:pseudo-active', frames: ['before', 'active'] },
  'animation-spin': { checkpoint: 'interaction:animation-progress', frames: ['before', 'after'] },
  'transition-basic': { checkpoint: 'interaction:transition-progress', frames: ['before', 'during', 'after'] },
}

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

/** 校验原始 PNG 对结论的必要支撑，不改写报告或自动更新基线。 */
export async function validateNativePixelEvidence(report: NativePlatformReport, cropsDirectory: string) {
  const resultById = new Map(report.results.map(result => [result.id, result]))
  const errors: Error[] = []
  for (const item of compatibilityCases) {
    const staticResult = staticById.get(item.id)
    if (!staticResult?.generated || !staticResult.bundled || item.evidence === 'build' || item.probe === 'geometry') {
      continue
    }
    const sequence = item.probe === 'interaction'
      ? interactionSequences[item.id]
      : { checkpoint: 'pixel:probe-vs-control', frames: ['probe', 'control'] }
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
    }
    catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, `Lynx 像素证据无效：\n${errors.map(error => error.message).join('\n')}`)
  }
}
