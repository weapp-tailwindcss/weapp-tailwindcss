import type { Buffer } from 'node:buffer'
import type { NativeCaseReceipt, NativePairEvidence } from '../../examples/react-native-expo/src/compatibility/protocol'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'

/** 对同屏测试节点与显式参考节点采样；空白、裁剪和错误几何都不能算像素通过。 */
export function assessNativePair(image: PNG, pair: NativePairEvidence) {
  const ratio = pair.viewport.pixelRatio
  const rects = [pair.probe, pair.reference, pair.target, pair.referenceTarget]
  if (!Number.isFinite(ratio) || ratio <= 0 || rects.some(rect => !Object.values(rect).every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || rect.x < 0 || rect.y < 0)) {
    throw new Error('React Native pair has invalid geometry')
  }
  const geometry = Math.abs(pair.target.width - pair.referenceTarget.width) <= 0.75
    && Math.abs(pair.target.height - pair.referenceTarget.height) <= 0.75
    && Math.abs((pair.target.x - pair.probe.x) - (pair.referenceTarget.x - pair.reference.x)) <= 0.75
    && Math.abs((pair.target.y - pair.probe.y) - (pair.referenceTarget.y - pair.reference.y)) <= 0.75
  const width = Math.round(pair.reference.width * ratio)
  const height = Math.round(pair.reference.height * ratio)
  const origins = [pair.probe, pair.reference].map(rect => ({ x: Math.round(rect.x * ratio), y: Math.round(rect.y * ratio) }))
  if (Math.abs(pair.probe.width - pair.reference.width) > 0.5 || Math.abs(pair.probe.height - pair.reference.height) > 0.5
    || origins.some(origin => origin.x + width > image.width || origin.y + height > image.height)) {
    throw new Error('React Native pair screenshot is clipped or mismatched')
  }
  let active = 0
  let mismatches = 0
  let difference = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offsets = origins.map(origin => ((origin.y + y) * image.width + origin.x + x) * 4)
      const deltas = [0, 1, 2].map(channel => Math.abs(image.data[offsets[0]! + channel]! - image.data[offsets[1]! + channel]!))
      const foreground = [0, 1, 2].some(channel => Math.abs(image.data[offsets[1]! + channel]! - [226, 232, 240][channel]!) > 10)
      if (foreground || deltas.some(delta => delta > 10)) {
        active++
        difference += deltas.reduce((sum, delta) => sum + delta, 0) / 3
        if (deltas.some(delta => delta > 24)) {
          mismatches++
        }
      }
    }
  }
  const mismatchRatio = active ? mismatches / active : 1
  const meanDifference = active ? difference / active : 255
  return [
    { name: `runtime:${pair.phase}:geometry`, passed: geometry, actual: JSON.stringify(pair.target), expected: JSON.stringify(pair.referenceTarget) },
    { name: `runtime:${pair.phase}:pixel`, passed: active >= 16 && mismatchRatio <= 0.05 && meanDifference <= 4, actual: JSON.stringify({ active, mismatchRatio, meanDifference }), expected: '同屏显式参考节点的几何与前景像素一致' },
  ]
}

export async function captureNativePair(pair: NativePairEvidence, options: {
  runId: string
  artifacts: string
  capture: (filename: string) => Promise<string>
}): Promise<NativeCaseReceipt> {
  if (pair.runId !== options.runId || !/^[\w.-]+$/.test(pair.id) || !/^[\w.-]+$/.test(pair.phase) || !/^[\w.-]+$/.test(pair.revision)) {
    throw new Error('React Native pair has a stale run or invalid artifact identity')
  }
  const name = `case-${pair.revision}-${pair.id}-${pair.phase}.png`
  await fs.writeFile(path.join(options.artifacts, `${name}.pair.json`), `${JSON.stringify(pair, null, 2)}\n`)
  let checkpoints: ReturnType<typeof assessNativePair> = []
  let contents: Buffer | undefined
  let consecutive = 0
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const file = await options.capture(name)
    contents = await fs.readFile(file)
    checkpoints = assessNativePair(PNG.sync.read(contents), pair)
    consecutive = checkpoints.every(checkpoint => checkpoint.passed) ? consecutive + 1 : 0
    if (consecutive >= 2) {
      break
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!contents) {
    throw new Error('React Native pair screenshot is missing')
  }
  const receipt: NativeCaseReceipt = {
    runId: options.runId,
    id: pair.id,
    phase: pair.phase,
    checkpoints,
    artifact: { name, sha256: createHash('sha256').update(contents).digest('hex'), byteLength: contents.length },
  }
  await fs.writeFile(path.join(options.artifacts, `${name}.json`), `${JSON.stringify({ pair, receipt }, null, 2)}\n`)
  return receipt
}

/** 门禁重新读取宿主保存的截图与坐标，不相信报告中的布尔检查点。 */
export async function validateNativeArtifacts(report: import('./catalog').ReactNativeReport, directory: string) {
  for (const receipt of report.receipts) {
    const expectedName = `case-${report.revision}-${receipt.id}-${receipt.phase}.png`
    if (receipt.artifact.name !== expectedName || !/^[\w.-]+$/.test(expectedName)) {
      throw new Error('Invalid native screenshot artifact identity')
    }
    const file = path.join(directory, expectedName)
    const contents = await fs.readFile(file)
    const saved = JSON.parse(await fs.readFile(`${file}.json`, 'utf8')) as { pair: NativePairEvidence, receipt: NativeCaseReceipt }
    if (contents.length !== receipt.artifact.byteLength || createHash('sha256').update(contents).digest('hex') !== receipt.artifact.sha256
      || JSON.stringify(saved.receipt) !== JSON.stringify(receipt)
      || saved.pair.runId !== report.runId || saved.pair.revision !== report.revision
      || saved.pair.id !== receipt.id || saved.pair.phase !== receipt.phase) {
      throw new Error(`Native screenshot artifact is stale or modified: ${expectedName}`)
    }
    const observed = assessNativePair(PNG.sync.read(contents), saved.pair)
    if (observed.some(checkpoint => !checkpoint.passed) || JSON.stringify(observed) !== JSON.stringify(receipt.checkpoints)) {
      throw new Error(`Native screenshot no longer proves case semantics: ${expectedName}`)
    }
  }
}
