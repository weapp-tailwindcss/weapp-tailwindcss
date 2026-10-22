import type { NativePairEvidence } from '../../examples/react-native-expo/src/compatibility/protocol'
import { validateScrollEvidence } from './scroll-assessment'

/** 只比较成功采集的原件；每个 revision 的三步必须来自同一组挂载和事件历史。 */
export function assertScrollTransition(pair: NativePairEvidence, previous?: NativePairEvidence) {
  const current = validateScrollEvidence(pair)
  if (!previous) {
    if (current.stepIndex !== 0) {
      throw new Error('ScrollView 缺少初始阶段')
    }
    return
  }
  const before = validateScrollEvidence(previous)
  if (pair.runId !== previous.runId || pair.revision !== previous.revision || pair.id !== previous.id || pair.platform !== previous.platform
    || JSON.stringify(pair.runtimeInstallation) !== JSON.stringify(previous.runtimeInstallation) || current.stepIndex !== before.stepIndex + 1) {
    throw new Error('ScrollView 三阶段身份或顺序改变')
  }
  for (const side of current.sides) {
    const old = before.sides.find(item => item.side === side.side)!
    if (side.mountId !== old.mountId || JSON.stringify(side.history.slice(0, -1)) !== JSON.stringify(old.history)
      || side.command!.afterEventSequence < (old.event?.sequence ?? 0)
      || side.event!.sequence <= (old.event?.sequence ?? 0)
      || JSON.stringify(side.layout) !== JSON.stringify(old.layout) || JSON.stringify(side.contentSize) !== JSON.stringify(old.contentSize)) {
      throw new Error('ScrollView 重挂载、旧事件或动作历史被改写')
    }
  }
}
