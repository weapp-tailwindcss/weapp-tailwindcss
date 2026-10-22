import type { NativeRect } from './protocol'
import type { NativeScrollCommand, NativeScrollEvent, NativeScrollEvidence, NativeScrollPhase, NativeScrollSide } from './scroll-fixture'
import { nativeScrollFixture } from './scroll-fixture'

const sides: NativeScrollSide[] = ['probe', 'reference', 'control']
interface ScrollHandle {
  mountId: string
  scrollTo: (command: { x: number, y: number, animated: false }) => void
  firstStripe: () => Promise<NativeRect>
}
interface SideState {
  handle?: ScrollHandle
  layout?: { width: number, height: number }
  contentSize?: { width: number, height: number }
  command?: NativeScrollCommand
  event?: NativeScrollEvent
  history: Array<{ command: NativeScrollCommand, event: NativeScrollEvent }>
  sequence: number
}

function size(value: unknown) {
  const observed = value as { width?: unknown, height?: unknown }
  if (!observed || typeof observed.width !== 'number' || typeof observed.height !== 'number'
    || !Number.isFinite(observed.width) || !Number.isFinite(observed.height) || observed.width <= 0 || observed.height <= 0) {
    throw new Error('ScrollView 实际尺寸事件无效')
  }
  return { width: observed.width, height: observed.height }
}

/** 三阶段共用同一挂载与事件账本；等待取消不销毁组件，卸载才释放 session。 */
export function createScrollReadiness(identity: { revision: string, id: string }) {
  const states: Record<NativeScrollSide, SideState> = { probe: { sequence: 0, history: [] }, reference: { sequence: 0, history: [] }, control: { sequence: 0, history: [] } }
  const listeners = new Set<() => void>()
  let failure: Error | undefined
  let disposed = false
  let stepIndex = -1
  let pending = false
  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }
  const fail = (error: unknown) => {
    failure ??= error instanceof Error ? error : new Error(String(error))
    notify()
  }
  const observe = (run: () => void) => {
    if (disposed) {
      return
    }
    try {
      run()
      notify()
    }
    catch (error) {
      fail(error)
    }
  }
  const callbacks = Object.fromEntries(sides.map(side => [side, {
    onLayout: (event: unknown) => observe(() => {
      states[side].layout = size((event as { nativeEvent?: { layout?: unknown } })?.nativeEvent?.layout)
    }),
    onContentSizeChange: (width: number, height: number) => observe(() => {
      states[side].contentSize = size({ width, height })
    }),
    onScroll: (event: unknown) => observe(() => {
      // RN Web 的事件包含延迟 getter；必须在回调内复制真实数值。
      const native = (event as { nativeEvent?: { contentOffset?: { x?: unknown, y?: unknown }, contentSize?: unknown, layoutMeasurement?: unknown } })?.nativeEvent
      const offset = native?.contentOffset
      if (!offset || typeof offset.x !== 'number' || typeof offset.y !== 'number' || !Number.isFinite(offset.x) || !Number.isFinite(offset.y)) {
        throw new Error('ScrollView 缺少真实 onScroll 偏移')
      }
      states[side].event = { sequence: ++states[side].sequence, contentOffset: { x: offset.x, y: offset.y }, contentSize: size(native?.contentSize), layoutMeasurement: size(native?.layoutMeasurement) }
    }),
  }])) as Record<NativeScrollSide, { onLayout: (event: unknown) => void, onContentSizeChange: (width: number, height: number) => void, onScroll: (event: unknown) => void }>

  const wait = (signal: AbortSignal, ready: () => boolean) => new Promise<void>((resolve, reject) => {
    const finish = (error?: unknown) => {
      clearTimeout(timer)
      listeners.delete(check)
      signal.removeEventListener('abort', abort)
      if (error) {
        reject(error)
      }
      else {
        resolve()
      }
    }
    const abort = () => finish(signal.reason ?? new Error('ScrollView 阶段取消'))
    const check = () => {
      if (signal.aborted) {
        abort()
      }
      else if (failure || disposed) {
        finish(failure ?? new Error('ScrollView session 已关闭'))
      }
      else if (ready()) {
        finish()
      }
    }
    const timer = setTimeout(() => finish(new Error('ScrollView 真实布局或滚动事件等待超过 5000ms')), 5_000)
    listeners.add(check)
    signal.addEventListener('abort', abort, { once: true })
    check()
  })
  const attached = () => sides.every(side => states[side].handle && states[side].layout && states[side].contentSize)
  return {
    callbacks,
    fail,
    attach(side: NativeScrollSide, handle: ScrollHandle) {
      const state = states[side]
      if (state.handle || disposed) {
        throw new Error('ScrollView 重复或过期挂载')
      }
      state.handle = handle
      notify()
      return () => {
        if (state.handle === handle) {
          state.handle = undefined
          if (!disposed && (pending || stepIndex >= 0) && stepIndex < 2) {
            fail(new Error('ScrollView 三阶段完成前组件卸载'))
          }
        }
      }
    },
    async advance(phase: NativeScrollPhase, signal: AbortSignal) {
      const next = nativeScrollFixture.phases.indexOf(phase)
      if (pending || next !== stepIndex + 1) {
        throw new Error('ScrollView 阶段缺失、重复或并发')
      }
      pending = true
      try {
        await wait(signal, attached)
        if (signal.aborted) {
          throw signal.reason ?? new Error('ScrollView 阶段取消')
        }
        if (next > 0) {
          for (const side of sides) {
            const state = states[side]
            state.command = { sequence: next, x: 0, y: nativeScrollFixture.offsets[next]!, animated: false, afterEventSequence: state.sequence }
            state.handle!.scrollTo({ x: 0, y: state.command.y, animated: false })
          }
          await wait(signal, () => sides.every((side) => {
            const { command, event } = states[side]
            return command && event && event.sequence > command.afterEventSequence && Math.abs(event.contentOffset.x) <= 0.5 && Math.abs(event.contentOffset.y - command.y) <= 0.5
          }))
          for (const side of sides) {
            const state = states[side]
            state.history.push(JSON.parse(JSON.stringify({ command: state.command, event: state.event })))
          }
        }
        stepIndex = next
      }
      catch (error) {
        fail(error)
        throw failure
      }
      finally {
        pending = false
      }
    },
    async snapshot(phase: NativeScrollPhase): Promise<NativeScrollEvidence> {
      if (failure || disposed || pending || nativeScrollFixture.phases[stepIndex] !== phase || !attached()) {
        throw failure ?? new Error('ScrollView 阶段尚无有效证据')
      }
      const observations = await Promise.all(sides.map(async (side) => {
        const state = states[side]
        const handle = state.handle!
        const firstStripe = await handle.firstStripe()
        if (failure || disposed || state.handle !== handle) {
          throw failure ?? new Error('ScrollView 测量期间挂载改变')
        }
        return { side, mountId: handle.mountId, layout: { ...state.layout! }, contentSize: { ...state.contentSize! }, firstStripe, history: JSON.parse(JSON.stringify(state.history)), ...(state.command ? { command: { ...state.command } } : {}), ...(state.event ? { event: { ...state.event, contentOffset: { ...state.event.contentOffset }, contentSize: { ...state.event.contentSize }, layoutMeasurement: { ...state.event.layoutMeasurement } } } : {}) }
      }))
      return { version: 1, ...identity, phase, stepIndex, sides: observations }
    },
    diagnostic() {
      // 同步冻结已观察数据，不重新测量、不回填配置、不序列化原生对象。
      return JSON.parse(JSON.stringify({ version: 1, ...identity, stepIndex, pending, disposed, error: failure?.message, sides: sides.map((side) => {
        const { handle, ...observed } = states[side]
        return { side, attached: Boolean(handle), mountId: handle?.mountId, ...observed }
      }) })) as unknown
    },
    dispose() {
      disposed = true
      notify()
    },
  }
}
