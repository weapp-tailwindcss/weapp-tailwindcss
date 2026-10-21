import type { Buffer } from 'node:buffer'
import type { NativeCaseReceipt, NativePairEvidence } from '../../examples/react-native-expo/src/compatibility/protocol'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'
import { expectedFixtureStyle, nativeFixtures } from '../../examples/react-native-expo/src/compatibility/protocol'
import { NATIVE_CAPTURE_TIMEOUT } from './capture-budget'
import { assertRuntimeIdentity, runtimeIdentity, validateRuntimeIdentity, validateRuntimeInstallation } from './installation-evidence'
import { createPairCaptureDiagnostics } from './pair-capture-diagnostics'

function sameTargetGeometry(target: NativePairEvidence['target'], frame: NativePairEvidence['probe'], otherTarget: NativePairEvidence['target'], otherFrame: NativePairEvidence['probe']) {
  return Math.abs(target.width - otherTarget.width) <= 0.75
    && Math.abs(target.height - otherTarget.height) <= 0.75
    && Math.abs((target.x - frame.x) - (otherTarget.x - otherFrame.x)) <= 0.75
    && Math.abs((target.y - frame.y) - (otherTarget.y - otherFrame.y)) <= 0.75
}

function solidTargetColor(image: PNG, rect: NativePairEvidence['target'], ratio: number, color: unknown) {
  if (typeof color !== 'string' || !/^#[a-f\d]{6}$/i.test(color)) {
    throw new Error('React Native priority fixture requires an independent solid color')
  }
  const rgb = [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16))
  const left = Math.round((rect.x + rect.width / 4) * ratio)
  const right = Math.round((rect.x + rect.width * 3 / 4) * ratio)
  const top = Math.round((rect.y + rect.height / 4) * ratio)
  const bottom = Math.round((rect.y + rect.height * 3 / 4) * ratio)
  const pixels = (right - left) * (bottom - top)
  if (left < 0 || top < 0 || right > image.width || bottom > image.height || pixels < 16) {
    return false
  }
  let matched = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const offset = (y * image.width + x) * 4
      if (rgb.every((channel, index) => Math.abs(image.data[offset + index]! - channel) <= 2)
        && image.data[offset + 3] === 255) {
        matched++
      }
    }
  }
  return matched / pixels >= 0.98
}

/** 对同屏节点采样；参考节点必须能与无效果对照区分，宿主同时忽略属性不能通过。 */
export function assessNativePair(image: PNG, pair: NativePairEvidence) {
  const fixture = nativeFixtures[pair.id]
  const expected = expectedFixtureStyle(pair.id, pair.phase, pair.platform)
  if (!fixture || !['android', 'ios', 'web'].includes(pair.platform) || !(fixture.phases ?? ['default']).includes(pair.phase) || !expected) {
    throw new Error('React Native pair has an unknown fixture, phase or platform')
  }
  if (!pair.control || !pair.controlTarget) {
    throw new Error('React Native pair is missing the independent control')
  }
  const ratio = pair.viewport.pixelRatio
  const frames = [pair.probe, pair.reference, pair.control]
  const targets = [pair.target, pair.referenceTarget, pair.controlTarget]
  if (!Number.isFinite(ratio) || ratio <= 0
    || frames.some(rect => !rect || !Object.values(rect).every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || rect.x < 0 || rect.y < 0)
    || targets.some(rect => !rect || !Object.values(rect).every(Number.isFinite) || rect.width < 0 || rect.height < 0 || rect.x < 0 || rect.y < 0)
    || pair.target.width <= 0 || pair.target.height <= 0 || pair.referenceTarget.width <= 0 || pair.referenceTarget.height <= 0) {
    throw new Error('React Native pair has invalid geometry')
  }
  const geometry = sameTargetGeometry(pair.target, pair.probe, pair.referenceTarget, pair.reference)
  const width = Math.round(pair.reference.width * ratio)
  const height = Math.round(pair.reference.height * ratio)
  const origins = frames.map(rect => ({ x: Math.round(rect.x * ratio), y: Math.round(rect.y * ratio) }))
  if (frames.some(rect => Math.abs(rect.width - pair.reference.width) > 0.5 || Math.abs(rect.height - pair.reference.height) > 0.5)
    || origins.some(origin => origin.x + width > image.width || origin.y + height > image.height)
    || origins.some((origin, index) => origins.slice(index + 1).some(other => origin.x < other.x + width && origin.x + width > other.x && origin.y < other.y + height && origin.y + height > other.y))) {
    throw new Error('React Native pair screenshot is clipped, overlapping or mismatched')
  }
  let active = 0
  let mismatches = 0
  let difference = 0
  let controlPixels = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offsets = origins.map(origin => ((origin.y + y) * image.width + origin.x + x) * 4)
      const deltas = [0, 1, 2].map(channel => Math.abs(image.data[offsets[0]! + channel]! - image.data[offsets[1]! + channel]!))
      if ([0, 1, 2].some(channel => Math.abs(image.data[offsets[1]! + channel]! - image.data[offsets[2]! + channel]!) > 2)) {
        controlPixels++
      }
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
  const controlGeometry = !sameTargetGeometry(pair.referenceTarget, pair.reference, pair.controlTarget, pair.control)
  const observable = controlGeometry || controlPixels >= 16
  const expectsEffect = Object.keys(expected).length > 0
  // 优先级案例还核独立绝对色，防 probe/reference 同时错误或无效果 control 被替换。
  const priorityColors = fixture.priorityCompetition
    ? {
        probe: solidTargetColor(image, pair.target, ratio, expected['backgroundColor']),
        reference: solidTargetColor(image, pair.referenceTarget, ratio, expected['backgroundColor']),
        control: solidTargetColor(image, pair.controlTarget, ratio, fixture.base?.['backgroundColor']),
      }
    : undefined
  return [
    { name: `runtime:${pair.phase}:geometry`, passed: geometry, actual: JSON.stringify(pair.target), expected: JSON.stringify(pair.referenceTarget) },
    { name: `runtime:${pair.phase}:pixel`, passed: active >= 16 && mismatchRatio <= 0.05 && meanDifference <= 4 && (!priorityColors || (priorityColors.probe && priorityColors.reference)), actual: JSON.stringify({ active, mismatchRatio, meanDifference, ...(priorityColors ? { priorityColors } : {}) }), expected: '同屏显式参考节点的几何与前景像素一致；优先级夹具同时满足独立颜色预期' },
    { name: `runtime:${pair.phase}:control`, passed: observable === expectsEffect && (!priorityColors || priorityColors.control), actual: JSON.stringify({ controlGeometry, controlPixels, observable, ...(priorityColors ? { priorityColor: priorityColors.control } : {}) }), expected: expectsEffect ? '显式参考样式相对无效果 control 存在可测的几何或像素差异' : '条件未命中时与无效果 control 一致' },
  ]
}

export async function captureNativePair(pair: NativePairEvidence, options: {
  runId: string
  artifacts: string
  cancelSignal?: AbortSignal
  capture: (filename: string) => Promise<string>
}): Promise<NativeCaseReceipt> {
  validateRuntimeIdentity(pair.runtimeInstallation)
  if (pair.runId !== options.runId || !/^[\w.-]+$/.test(pair.id) || !/^[\w.-]+$/.test(pair.phase) || !/^[\w.-]+$/.test(pair.revision)) {
    throw new Error('React Native pair has a stale run or invalid artifact identity')
  }
  const name = `case-${pair.revision}-${pair.id}-${pair.phase}.png`
  const diagnostics = createPairCaptureDiagnostics(pair, path.join(options.artifacts, `${name}.capture.json`), options.cancelSignal)
  try {
    options.cancelSignal?.throwIfAborted()
    await fs.writeFile(path.join(options.artifacts, `${name}.pair.json`), `${JSON.stringify(pair, null, 2)}\n`)
    let checkpoints: ReturnType<typeof assessNativePair> = []
    let contents: Buffer | undefined
    let consecutive = 0
    const deadline = Date.now() + NATIVE_CAPTURE_TIMEOUT
    while (Date.now() < deadline) {
      options.cancelSignal?.throwIfAborted()
      const frame = diagnostics.beginFrame()
      const file = await options.capture(name)
      options.cancelSignal?.throwIfAborted()
      frame.capturedAtMs = diagnostics.elapsed()
      diagnostics.stage('read-screenshot')
      contents = await fs.readFile(file)
      options.cancelSignal?.throwIfAborted()
      frame.readAtMs = diagnostics.elapsed()
      frame.byteLength = contents.length
      frame.sha256 = createHash('sha256').update(contents).digest('hex')
      diagnostics.stage('decode-screenshot')
      const png = PNG.sync.read(contents)
      frame.decodedAtMs = diagnostics.elapsed()
      diagnostics.stage('assess-screenshot')
      checkpoints = assessNativePair(png, pair)
      diagnostics.assessed(frame, checkpoints)
      consecutive = checkpoints.every(checkpoint => checkpoint.passed) ? consecutive + 1 : 0
      if (consecutive >= 2 && Date.now() < deadline) {
        break
      }
      if (Date.now() >= deadline) {
        break
      }
      diagnostics.stage('wait-for-next-frame')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!contents) {
      throw new Error('React Native pair screenshot is missing')
    }
    if (consecutive < 2 || Date.now() >= deadline) {
      throw new Error('Native pair requires two consecutive passing frames within its capture deadline')
    }
    options.cancelSignal?.throwIfAborted()
    const receipt: NativeCaseReceipt = {
      runtimeInstallation: runtimeIdentity(pair.runtimeInstallation),
      runId: options.runId,
      id: pair.id,
      phase: pair.phase,
      checkpoints,
      artifact: { name, sha256: createHash('sha256').update(contents).digest('hex'), byteLength: contents.length },
    }
    diagnostics.stage('write-receipt')
    await fs.writeFile(path.join(options.artifacts, `${name}.json`), `${JSON.stringify({ pair, receipt }, null, 2)}\n`, { signal: options.cancelSignal })
    return receipt
  }
  catch (error) { throw diagnostics.fail(error) }
  finally { diagnostics.dispose() }
}

/** 门禁重新读取宿主保存的截图与坐标，不相信报告中的布尔检查点。 */
export async function validateNativeArtifacts(report: import('./catalog').ReactNativeReport, directory: string) {
  validateRuntimeInstallation(report.runtimeInstallation)
  for (const receipt of report.receipts) {
    assertRuntimeIdentity(receipt.runtimeInstallation, report.runtimeInstallation)
    const expectedName = `case-${report.revision}-${receipt.id}-${receipt.phase}.png`
    if (receipt.artifact.name !== expectedName || !/^[\w.-]+$/.test(expectedName)) {
      throw new Error('Invalid native screenshot artifact identity')
    }
    const file = path.join(directory, expectedName)
    const contents = await fs.readFile(file)
    const saved = JSON.parse(await fs.readFile(`${file}.json`, 'utf8')) as { pair: NativePairEvidence, receipt: NativeCaseReceipt }
    assertRuntimeIdentity(saved.pair.runtimeInstallation, report.runtimeInstallation)
    if (contents.length !== receipt.artifact.byteLength || createHash('sha256').update(contents).digest('hex') !== receipt.artifact.sha256
      || JSON.stringify(saved.receipt) !== JSON.stringify(receipt)
      || saved.pair.runId !== report.runId || saved.pair.revision !== report.revision
      || saved.pair.id !== receipt.id || saved.pair.phase !== receipt.phase
      || (report.platform !== undefined && saved.pair.platform !== report.platform)) {
      throw new Error(`Native screenshot artifact is stale or modified: ${expectedName}`)
    }
    const observed = assessNativePair(PNG.sync.read(contents), saved.pair)
    if (observed.some(checkpoint => !checkpoint.passed) || JSON.stringify(observed) !== JSON.stringify(receipt.checkpoints)) {
      throw new Error(`Native screenshot no longer proves case semantics: ${expectedName}`)
    }
  }
}
