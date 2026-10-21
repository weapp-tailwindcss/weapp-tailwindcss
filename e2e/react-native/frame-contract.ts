import type { NativeCaseReceipt } from '../../examples/react-native-expo/src/compatibility/protocol'
import { NATIVE_CAPTURE_TIMEOUT } from './capture-budget'

/** 不接受旧单帧证据、跳号或超出原判定预算的连续帧声明。 */
export function validateNativeFrameSequence(receipt: NativeCaseReceipt) {
  const capture = receipt.capture
  if (capture?.version !== 1 || capture.timeoutMs !== NATIVE_CAPTURE_TIMEOUT || !Array.isArray(capture.frames) || capture.frames.length < 2) {
    throw new Error('Native capture requires fresh consecutive frame evidence')
  }
  let previousEnd = 0
  for (const [index, frame] of capture.frames.entries()) {
    const times = [frame.startedAtMs, frame.capturedAtMs, frame.readAtMs, ...(frame.decodedAtMs === undefined ? [] : [frame.decodedAtMs]), frame.assessedAtMs]
    const expectedName = `${receipt.artifact.name.slice(0, -4)}-frame-${index + 1}.png`
    if (frame.index !== index + 1 || frame.artifact?.name !== expectedName || !/^[\w.-]+$/.test(expectedName)
      || !/^[a-f\d]{64}$/.test(frame.artifact.sha256) || !Number.isSafeInteger(frame.artifact.byteLength) || frame.artifact.byteLength < 100
      || times.some((time, position) => !Number.isFinite(time) || time < (position ? times[position - 1]! : previousEnd) || time >= NATIVE_CAPTURE_TIMEOUT)
      || !Array.isArray(frame.checkpoints) || frame.checkpoints.length !== 3
      || (frame.assessmentReusedFromFrame !== undefined
        ? index === 0 || frame.assessmentReusedFromFrame !== index || frame.decodedAtMs !== undefined
        : frame.decodedAtMs === undefined)) {
      throw new Error('Native capture frame sequence, timing or artifact is invalid')
    }
    previousEnd = frame.assessedAtMs
  }
  if (capture.frames.slice(-2).some(frame => frame.checkpoints.some(checkpoint => !checkpoint.passed))) {
    throw new Error('Native capture requires two consecutive passing frames')
  }
}
