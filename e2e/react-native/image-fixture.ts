import type { NativePairEvidence } from '../../examples/react-native-expo/src/compatibility/protocol'
import { PNG } from 'pngjs'
import { nativeImageFixture } from '../../examples/react-native-expo/src/compatibility/image-fixture'

/** 完整报告门禁的合成图片，不能作为真实设备证据。 */
export function syntheticImagePair(identity: Pick<NativePairEvidence, 'runtimeInstallation' | 'runId' | 'platform' | 'revision' | 'id' | 'phase'>) {
  const pair: NativePairEvidence = {
    ...identity,
    probe: { x: 0, y: 0, width: 160, height: 128 },
    reference: { x: 0, y: 136, width: 160, height: 128 },
    control: { x: 0, y: 272, width: 160, height: 128 },
    target: { x: 16, y: 16, width: 44, height: 44 },
    referenceTarget: { x: 16, y: 152, width: 44, height: 44 },
    controlTarget: { x: 16, y: 288, width: 80, height: 40 },
    viewport: { width: 160, height: 400, pixelRatio: 1 },
    image: { version: 2, loads: (['probe', 'reference', 'control'] as const).map(side => ({ side, revision: identity.revision, id: identity.id, phase: identity.phase, event: 'load', ...(identity.platform === 'web' ? { origin: 'web-node' as const, decoder: 'decode' as const, complete: true as const, trusted: true as const } : { origin: 'native-source' as const }), uri: nativeImageFixture.uri, ...nativeImageFixture.intrinsic })) },
  }
  const image = new PNG({ width: 160, height: 400 })
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data.set([226, 232, 240, 255], offset)
  }
  for (const rect of [pair.target, pair.referenceTarget, pair.controlTarget]) {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        image.data.set(nativeImageFixture.colors[x < rect.x + rect.width / 2 ? 0 : 1], (y * image.width + x) * 4)
      }
    }
  }
  return { pair, image }
}
