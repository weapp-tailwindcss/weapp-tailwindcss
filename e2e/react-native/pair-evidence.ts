import type { Buffer } from 'node:buffer'
import type { NativeCaptureFrame, NativeCaseReceipt, NativePairEvidence } from '../../examples/react-native-expo/src/compatibility/protocol'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'
import { NATIVE_CAPTURE_TIMEOUT } from './capture-budget'
import { validateNativeFrameSequence } from './frame-contract'
import { assertRuntimeIdentity, runtimeIdentity, validateRuntimeIdentity, validateRuntimeInstallation } from './installation-evidence'
import { assessNativePair } from './pair-assessment'
import { createPairCaptureDiagnostics } from './pair-capture-diagnostics'
import { assertScrollTransition } from './scroll-sequence'

export { assessNativePair } from './pair-assessment'

export function nativeFrameName(name: string, index: number) {
  return `${name.slice(0, -4)}-frame-${index}.png`
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
    const frames: NativeCaptureFrame[] = []
    let previous: { contents: Buffer, checkpoints: ReturnType<typeof assessNativePair>, index: number } | undefined
    let consecutive = 0
    const deadline = Date.now() + NATIVE_CAPTURE_TIMEOUT
    while (Date.now() < deadline) {
      options.cancelSignal?.throwIfAborted()
      const frame = diagnostics.beginFrame()
      const frameName = nativeFrameName(name, frame.index)
      const file = await options.capture(frameName)
      options.cancelSignal?.throwIfAborted()
      frame.capturedAtMs = diagnostics.elapsed()
      if (path.resolve(file) !== path.resolve(options.artifacts, frameName)) {
        throw new Error('Native screenshot frame does not belong to the owned artifact path')
      }
      diagnostics.stage('read-screenshot')
      const contents = await fs.readFile(file)
      options.cancelSignal?.throwIfAborted()
      frame.readAtMs = diagnostics.elapsed()
      frame.byteLength = contents.length
      frame.sha256 = createHash('sha256').update(contents).digest('hex')
      let checkpoints: ReturnType<typeof assessNativePair>
      if (previous?.contents.equals(contents)) {
        // 每次仍真实截图；仅当前不可变 pair 的相邻完整字节相同时省去重复计算。
        checkpoints = previous.checkpoints
        frame.assessmentReusedFromFrame = previous.index
      }
      else {
        diagnostics.stage('decode-screenshot')
        const png = PNG.sync.read(contents)
        frame.decodedAtMs = diagnostics.elapsed()
        diagnostics.stage('assess-screenshot')
        checkpoints = assessNativePair(png, pair)
      }
      diagnostics.stage('assess-screenshot')
      diagnostics.assessed(frame, checkpoints)
      frames.push({
        index: frame.index,
        startedAtMs: frame.startedAtMs,
        capturedAtMs: frame.capturedAtMs,
        readAtMs: frame.readAtMs,
        ...(frame.decodedAtMs === undefined ? {} : { decodedAtMs: frame.decodedAtMs }),
        ...(frame.assessmentReusedFromFrame === undefined ? {} : { assessmentReusedFromFrame: frame.assessmentReusedFromFrame }),
        assessedAtMs: frame.assessedAtMs!,
        checkpoints,
        artifact: { name: frameName, sha256: frame.sha256, byteLength: contents.length },
      })
      previous = { contents, checkpoints, index: frame.index }
      consecutive = checkpoints.every(checkpoint => checkpoint.passed) ? consecutive + 1 : 0
      if (consecutive >= 2 || Date.now() >= deadline) {
        break
      }
      diagnostics.stage('wait-for-next-frame')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!previous) {
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
      checkpoints: previous.checkpoints,
      artifact: { ...frames.at(-1)!.artifact, name },
      capture: { version: 1, timeoutMs: NATIVE_CAPTURE_TIMEOUT, frames },
    }
    validateNativeFrameSequence(receipt)
    diagnostics.stage('write-receipt')
    await fs.writeFile(path.join(options.artifacts, name), previous.contents, { signal: options.cancelSignal, flag: 'wx' })
    await fs.writeFile(path.join(options.artifacts, `${name}.json`), `${JSON.stringify({ pair, receipt }, null, 2)}\n`, { signal: options.cancelSignal, flag: 'wx' })
    return receipt
  }
  catch (error) { throw diagnostics.fail(error) }
  finally { diagnostics.dispose() }
}

/** 门禁独立重算所有帧；末帧兼容入口不能代替连续两帧的原件。 */
export async function validateNativeArtifacts(report: import('./catalog').ReactNativeReport, directory: string) {
  validateRuntimeInstallation(report.runtimeInstallation)
  const scrolls = new Map<string, NativePairEvidence>()
  for (const receipt of report.receipts) {
    assertRuntimeIdentity(receipt.runtimeInstallation, report.runtimeInstallation)
    const expectedName = `case-${report.revision}-${receipt.id}-${receipt.phase}.png`
    if (receipt.artifact.name !== expectedName || !/^[\w.-]+$/.test(expectedName)) {
      throw new Error('Invalid native screenshot artifact identity')
    }
    validateNativeFrameSequence(receipt)
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
    let previous: Buffer | undefined
    let consecutive = 0
    for (const frame of receipt.capture.frames) {
      const bytes = await fs.readFile(path.join(directory, frame.artifact.name))
      if (bytes.length !== frame.artifact.byteLength || createHash('sha256').update(bytes).digest('hex') !== frame.artifact.sha256
        || (frame.assessmentReusedFromFrame !== undefined && !previous?.equals(bytes))) {
        throw new Error(`Native screenshot frame is modified: ${frame.artifact.name}`)
      }
      const observed = assessNativePair(PNG.sync.read(bytes), saved.pair)
      if (JSON.stringify(observed) !== JSON.stringify(frame.checkpoints)) {
        throw new Error(`Native frame no longer proves case semantics: ${frame.artifact.name}`)
      }
      consecutive = observed.every(checkpoint => checkpoint.passed) ? consecutive + 1 : 0
      previous = bytes
    }
    if (consecutive < 2 || !previous?.equals(contents)
      || JSON.stringify(receipt.capture.frames.at(-1)!.checkpoints) !== JSON.stringify(receipt.checkpoints)) {
      throw new Error(`Native screenshot no longer proves consecutive frame semantics: ${expectedName}`)
    }
    if (saved.pair.scroll) {
      const key = `${saved.pair.revision}:${saved.pair.id}`
      assertScrollTransition(saved.pair, scrolls.get(key))
      scrolls.set(key, saved.pair)
    }
  }
  if ([...scrolls.values()].some(pair => pair.scroll!.stepIndex !== 2)) {
    throw new Error('ScrollView 成功原件缺少完整初始、滚动和恢复序列')
  }
}
