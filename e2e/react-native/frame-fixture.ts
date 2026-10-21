import type { NativeCaseReceipt, NativeCheckpoint, NativeScreenshotArtifact } from '../../examples/react-native-expo/src/compatibility/protocol'
import { NATIVE_CAPTURE_TIMEOUT } from './capture-budget'
import { nativeFrameName } from './pair-evidence'

/** 纯回归的合成时序，不赋予设备或浏览器运行身份。 */
export function syntheticFrameCapture(artifact: NativeScreenshotArtifact, checkpoints: NativeCheckpoint[]): NativeCaseReceipt['capture'] {
  return {
    version: 1,
    timeoutMs: NATIVE_CAPTURE_TIMEOUT,
    frames: [1, 2].map(index => ({
      index,
      startedAtMs: index * 100,
      capturedAtMs: index * 100 + 10,
      readAtMs: index * 100 + 11,
      decodedAtMs: index * 100 + 12,
      assessedAtMs: index * 100 + 13,
      artifact: { ...artifact, name: nativeFrameName(artifact.name, index) },
      checkpoints,
    })),
  }
}
