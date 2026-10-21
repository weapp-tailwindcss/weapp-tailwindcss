import type { PNG } from 'pngjs'
import type { NativePairEvidence } from '../../examples/react-native-expo/src/compatibility/protocol'
import type { NativeScrollCommand, NativeScrollEvent } from '../../examples/react-native-expo/src/compatibility/scroll-fixture'
import { nativeScrollFixture as fixture } from '../../examples/react-native-expo/src/compatibility/scroll-fixture'

const sides = ['probe', 'reference', 'control'] as const
const close = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.5
const size = (value: { width: number, height: number } | undefined) => value && [value.width, value.height].every(item => Number.isFinite(item) && item > 0)

function validAction(command: NativeScrollCommand | undefined, event: NativeScrollEvent | undefined, stepIndex: number) {
  return command && event && command.sequence === stepIndex && command.x === 0 && command.y === fixture.offsets[stepIndex] && command.animated === false
    && Number.isInteger(command.afterEventSequence) && command.afterEventSequence >= 0 && Number.isInteger(event.sequence) && event.sequence > command.afterEventSequence
    && close(event.contentOffset?.x, 0) && close(event.contentOffset?.y, command.y) && size(event.contentSize) && size(event.layoutMeasurement)
}

/** 事件身份独立于截图核验；命令后的事件和不可改写历史不能由几何相同替代。 */
export function validateScrollEvidence(pair: NativePairEvidence) {
  const scroll = pair.scroll
  const stepIndex = (fixture.phases as readonly string[]).indexOf(pair.phase)
  if (scroll?.version !== 1 || stepIndex < 0 || scroll.stepIndex !== stepIndex || scroll.phase !== pair.phase || scroll.revision !== pair.revision || scroll.id !== pair.id
    || !Array.isArray(scroll.sides) || scroll.sides.length !== 3 || sides.some(side => scroll.sides.filter(item => item?.side === side).length !== 1)
    || new Set(scroll.sides.map(item => item.mountId)).size !== 3) {
    throw new Error('ScrollView 缺少当前阶段、独立挂载或三侧事件证据')
  }
  for (const side of scroll.sides) {
    if (!side.mountId || typeof side.mountId !== 'string' || !size(side.layout) || !size(side.contentSize) || side.contentSize.height !== fixture.contentHeight
      || !side.firstStripe || !Object.values(side.firstStripe).every(Number.isFinite) || !Array.isArray(side.history) || side.history.length !== stepIndex) {
      throw new Error('ScrollView 原始布局、内容尺寸或动作历史无效')
    }
    for (const [index, action] of side.history.entries()) {
      if (!action || !validAction(action.command, action.event, index + 1)
        || !close(action.event.contentSize.width, side.contentSize.width) || !close(action.event.contentSize.height, side.contentSize.height)
        || !close(action.event.layoutMeasurement.width, side.layout.width) || !close(action.event.layoutMeasurement.height, side.layout.height)) {
        throw new Error('ScrollView 动作历史缺少真实命令后事件')
      }
    }
    if (stepIndex > 0 && (!validAction(side.command, side.event, stepIndex)
      || JSON.stringify(side.command) !== JSON.stringify(side.history.at(-1)!.command)
      || side.event!.sequence < side.history.at(-1)!.event.sequence)) {
      throw new Error('ScrollView 缺少本次 scrollTo 后的新事件')
    }
    if (stepIndex === 0 && (side.command || (side.event && (!close(side.event.contentOffset?.x, 0) || !close(side.event.contentOffset?.y, 0))))) {
      throw new Error('ScrollView 初始阶段不能预先滚动或复用后续命令')
    }
    if (side.event && (!Number.isInteger(side.event.sequence) || side.event.sequence <= 0 || !size(side.event.layoutMeasurement) || !size(side.event.contentSize)
      || !close(side.event.layoutMeasurement.width, side.layout.width) || !close(side.event.layoutMeasurement.height, side.layout.height)
      || !close(side.event.contentSize.width, side.contentSize.width) || !close(side.event.contentSize.height, side.contentSize.height))) {
      throw new Error('ScrollView 事件布局与真实 layout/contentSize 不符')
    }
  }
  return scroll
}

/** viewport、首条内容位移、绝对条纹颜色及边界裁剪同时核验。 */
export function assessNativeScroll(image: PNG, pair: NativePairEvidence) {
  const scroll = validateScrollEvidence(pair)
  const targets = [pair.target, pair.referenceTarget, pair.controlTarget]
  const frames = [pair.probe, pair.reference, pair.control]
  const offset = fixture.offsets[scroll.stepIndex]!
  const geometry = sides.map((side, index) => {
    const observed = scroll.sides.find(item => item.side === side)!
    const rect = targets[index]!
    const expected = side === 'control' ? fixture.control : fixture.display
    return close(rect.width, expected.width) && close(rect.height, expected.height)
      && close(rect.x - frames[index]!.x, 16) && close(rect.y - frames[index]!.y, 16)
      && close(observed.layout.width, rect.width) && close(observed.layout.height, rect.height) && close(observed.contentSize.width, rect.width)
      && close(observed.firstStripe.x, rect.x) && close(observed.firstStripe.y, rect.y - offset)
      && close(observed.firstStripe.width, rect.width) && close(observed.firstStripe.height, fixture.stripeHeight)
  })
  const rgb = offset ? [37, 99, 235, 255] : [220, 38, 38, 255]
  const pixel = (x: number, y: number, expected: number[]) => {
    const px = Math.round(x * pair.viewport.pixelRatio)
    const py = Math.round(y * pair.viewport.pixelRatio)
    if (px < 0 || py < 0 || px >= image.width || py >= image.height) {
      return false
    }
    return expected.every((channel, index) => Math.abs(image.data[(py * image.width + px) * 4 + index]! - channel) <= 2)
  }
  const pixels = targets.map(rect => [0.25, 0.5, 0.75].every(horizontal => [0.25, 0.5, 0.75].every((vertical) => {
    const x = rect.x + rect.width * horizontal
    const y = rect.y + rect.height * vertical
    return [-1, 0, 1].every(dx => [-1, 0, 1].every(dy => pixel(x + dx / pair.viewport.pixelRatio, y + dy / pair.viewport.pixelRatio, rgb)))
  })) && [0.25, 0.5, 0.75].every(fraction => [[rect.x - 2, rect.y + rect.height * fraction], [rect.x + rect.width + 2, rect.y + rect.height * fraction], [rect.x + rect.width * fraction, rect.y - 2], [rect.x + rect.width * fraction, rect.y + rect.height + 2]].every(([x, y]) => pixel(x!, y!, [226, 232, 240, 255]))))
  return { geometry, pixels }
}
