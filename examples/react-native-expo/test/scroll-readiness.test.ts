import { afterEach, expect, it, vi } from 'vitest'
import { createScrollReadiness } from '../src/compatibility/scroll-readiness'

const sides = ['probe', 'reference', 'control'] as const
function fixture() {
  const session = createScrollReadiness({ revision: 'revision', id: 'sizing-size' })
  const detach: Array<() => void> = []
  const commands: Array<{ side: string, x: number, y: number, animated: boolean }> = []
  const dimensions = (side: typeof sides[number]) => ({ width: side === 'control' ? 80 : 44, height: side === 'control' ? 40 : 44 })
  const event = (side: typeof sides[number], y: number) => ({ nativeEvent: { contentOffset: { x: 0, y }, contentSize: { width: dimensions(side).width, height: 144 }, layoutMeasurement: dimensions(side) } })
  for (const side of sides) {
    detach.push(session.attach(side, { mountId: `mount-${side}`, scrollTo: command => commands.push({ side, ...command }), firstStripe: async () => ({ x: 16, y: 16, width: dimensions(side).width, height: 48 }) }))
    session.callbacks[side].onLayout({ nativeEvent: { layout: dimensions(side) } })
    session.callbacks[side].onContentSizeChange(dimensions(side).width, 144)
  }
  return { session, detach, commands, event }
}
afterEach(() => vi.useRealTimers())

it('初始阶段只消费真实 layout/contentSize；两次滚动必须各等命令后事件且保留历史前缀', async () => {
  const { session, commands, event } = fixture()
  const signal = new AbortController().signal
  await session.advance('scroll-initial', signal)
  const initial = await session.snapshot('scroll-initial')
  expect(initial.sides.every(side => !side.command && !side.event && side.history.length === 0)).toBe(true)
  expect(commands).toEqual([])
  let finished = false
  const offset = session.advance('scroll-offset', signal).then(() => { finished = true })
  await Promise.resolve()
  expect(commands).toHaveLength(3)
  expect(finished).toBe(false)
  for (const side of sides) session.callbacks[side].onScroll(event(side, 48))
  await offset
  const middle = await session.snapshot('scroll-offset')
  const restored = session.advance('scroll-restored', signal)
  await Promise.resolve()
  expect(commands).toHaveLength(6)
  for (const side of sides) session.callbacks[side].onScroll(event(side, 0))
  await restored
  const final = await session.snapshot('scroll-restored')
  expect(final.sides.map(side => side.mountId)).toEqual(initial.sides.map(side => side.mountId))
  expect(final.sides.every((side, index) => JSON.stringify(side.history[0]) === JSON.stringify(middle.sides[index]!.history[0]))).toBe(true)
  expect(middle.sides.every(side => side.history.length === 1 && side.command?.y === 48)).toBe(true)
  session.dispose()
})

it('旧偏移事件不能解锁本步；事件 getter 在回调内同步复制，后续原件改变不影响快照', async () => {
  const { session, event } = fixture()
  const signal = new AbortController().signal
  for (const side of sides) session.callbacks[side].onScroll(event(side, 48))
  await session.advance('scroll-initial', signal)
  let finished = false
  const pending = session.advance('scroll-offset', signal).then(() => { finished = true })
  await Promise.resolve()
  expect(finished).toBe(false)
  const events = sides.map(side => event(side, 48))
  for (const [index, side] of sides.entries()) session.callbacks[side].onScroll(events[index])
  await pending
  for (const original of events) original.nativeEvent.contentOffset.y = 999
  const observed = await session.snapshot('scroll-offset')
  expect(observed.sides.every(side => side.event?.contentOffset.y === 48 && side.event.sequence > side.command!.afterEventSequence)).toBe(true)
  session.dispose()
})

it('阶段等待取消后不发新命令、不复用等待者，dispose 清理定时器', async () => {
  vi.useFakeTimers()
  const { session, commands } = fixture()
  const controller = new AbortController()
  await session.advance('scroll-initial', controller.signal)
  const pending = session.advance('scroll-offset', controller.signal)
  const rejected = expect(pending).rejects.toThrow('owned cancellation')
  controller.abort(new Error('owned cancellation'))
  await rejected
  expect(commands).toEqual([])
  session.dispose()
  expect(vi.getTimerCount()).toBe(0)
})

it('三步未完成时卸载并重挂不能冒充恢复', async () => {
  const { session, detach } = fixture()
  await session.advance('scroll-initial', new AbortController().signal)
  detach[0]!()
  await expect(session.advance('scroll-offset', new AbortController().signal)).rejects.toThrow('组件卸载')
  session.dispose()
})

it('缺步骤、重复步骤和并发命令均拒绝', async () => {
  const { session } = fixture()
  const signal = new AbortController().signal
  await expect(session.advance('scroll-restored', signal)).rejects.toThrow('阶段缺失')
  await session.advance('scroll-initial', signal)
  await expect(session.advance('scroll-initial', signal)).rejects.toThrow('阶段缺失')
  const pending = session.advance('scroll-offset', signal)
  const rejected = expect(pending).rejects.toThrow('session 已关闭')
  await expect(session.advance('scroll-offset', signal)).rejects.toThrow('并发')
  session.dispose()
  await rejected
})

it('真实事件缺字段或等待超时保留错误，不能从配置回填', async () => {
  vi.useFakeTimers()
  const { session } = fixture()
  await session.advance('scroll-initial', new AbortController().signal)
  const pending = session.advance('scroll-offset', new AbortController().signal)
  const rejected = expect(pending).rejects.toThrow('缺少真实 onScroll')
  await Promise.resolve()
  session.callbacks.probe.onScroll({ nativeEvent: {} })
  await rejected
  session.dispose()
  const never = createScrollReadiness({ revision: 'next', id: 'sizing-size' })
  const timeout = expect(never.advance('scroll-initial', new AbortController().signal)).rejects.toThrow('超过 5000ms')
  await vi.advanceTimersByTimeAsync(5_000)
  await timeout
  never.dispose()
  expect(vi.getTimerCount()).toBe(0)
})

it('首次超时固定为session首错，不能用迟到事件重试同一步覆盖', async () => {
  vi.useFakeTimers()
  const { session, commands, event } = fixture()
  const signal = new AbortController().signal
  await session.advance('scroll-initial', signal)
  const pending = expect(session.advance('scroll-offset', signal)).rejects.toThrow('超过 5000ms')
  await vi.advanceTimersByTimeAsync(5_000)
  await pending
  for (const side of sides) session.callbacks[side].onScroll(event(side, 48))
  const retry = expect(session.advance('scroll-offset', signal)).rejects.toThrow('超过 5000ms')
  await Promise.resolve()
  for (const side of sides) session.callbacks[side].onScroll(event(side, 48))
  await retry
  expect(commands).toHaveLength(3)
  session.dispose()
})
