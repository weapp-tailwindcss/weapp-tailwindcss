import type { NativePairEvidence } from '../../examples/react-native-expo/src/compatibility/protocol'
import type { NativeScrollPhase } from '../../examples/react-native-expo/src/compatibility/scroll-fixture'
import { PNG } from 'pngjs'
import { nativeScrollFixture as fixture } from '../../examples/react-native-expo/src/compatibility/scroll-fixture'

/** 只供完整报告和篡改回归使用，不能作为真实设备的滚动事件或截图。 */
export function syntheticScrollPair(identity: Pick<NativePairEvidence, 'runtimeInstallation' | 'runId' | 'platform' | 'revision' | 'id' | 'phase'>) {
  const stepIndex = (fixture.phases as readonly string[]).indexOf(identity.phase)
  if (stepIndex < 0) {
    throw new Error('Unknown synthetic ScrollView phase')
  }
  const sides = ['probe', 'reference', 'control'] as const
  const targets = sides.map((side, index) => ({ x: 16, y: 16 + index * 136, ...(side === 'control' ? fixture.control : fixture.display) }))
  const offset = fixture.offsets[stepIndex]!
  const pair: NativePairEvidence = {
    ...identity,
    probe: { x: 0, y: 0, width: 160, height: 128 },
    reference: { x: 0, y: 136, width: 160, height: 128 },
    control: { x: 0, y: 272, width: 160, height: 128 },
    target: targets[0]!,
    referenceTarget: targets[1]!,
    controlTarget: targets[2]!,
    viewport: { width: 160, height: 400, pixelRatio: 1 },
    scroll: { version: 1, revision: identity.revision, id: identity.id, phase: identity.phase as NativeScrollPhase, stepIndex, sides: sides.map((side, index) => {
      const target = targets[index]!
      const history = Array.from({ length: stepIndex }, (_, step) => ({ command: { sequence: step + 1, x: 0, y: fixture.offsets[step + 1]!, animated: false as const, afterEventSequence: step }, event: { sequence: step + 1, contentOffset: { x: 0, y: fixture.offsets[step + 1]! }, contentSize: { width: target.width, height: fixture.contentHeight }, layoutMeasurement: { width: target.width, height: target.height } } }))
      return { side, mountId: `synthetic-${identity.revision}-${side}`, layout: { width: target.width, height: target.height }, contentSize: { width: target.width, height: fixture.contentHeight }, firstStripe: { ...target, y: target.y - offset, height: fixture.stripeHeight }, history, ...(history.length ? history.at(-1) : {}) }
    }) },
  }
  const image = new PNG({ width: 160, height: 400 })
  for (let i = 0; i < image.data.length; i += 4) {
    image.data.set([226, 232, 240, 255], i)
  }
  for (const target of targets) {
    for (let y = target.y; y < target.y + target.height; y++) {
      for (let x = target.x; x < target.x + target.width; x++) {
        image.data.set(offset ? [37, 99, 235, 255] : [220, 38, 38, 255], (y * image.width + x) * 4)
      }
    }
  }
  return { pair, image }
}
