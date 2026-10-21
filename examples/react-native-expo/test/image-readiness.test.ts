import { afterEach, expect, it, vi } from 'vitest'
import { nativeImageFixture } from '../src/compatibility/image-fixture'
import { createImageReadiness } from '../src/compatibility/image-readiness'

const identity = { revision: 'baseline', id: 'sizing-size', phase: 'image' }
const source = { ...nativeImageFixture.intrinsic, uri: nativeImageFixture.uri }
const webEvent = () => ({ nativeEvent: { type: 'load', isTrusted: true, target: null } })
const image = { tagName: 'IMG', isConnected: true, complete: true, naturalWidth: 16, naturalHeight: 8, currentSrc: source.uri, src: source.uri, decode: async () => {} }
const host = { isConnected: true, querySelectorAll: () => [image] }
const webHost = () => host
const signal = () => new AbortController().signal
afterEach(() => vi.useRealTimers())

it('RN Web 延迟转发的 load target 为空时，读取当前被测 Image 节点的真实解码结果', async () => {
  const image = { tagName: 'IMG', isConnected: true, complete: true, naturalWidth: 16, naturalHeight: 8, currentSrc: source.uri, src: source.uri, decode: async () => {} }
  const host = { isConnected: true, querySelectorAll: () => [image] }
  const gate = createImageReadiness(identity, 'web', () => host)
  for (const side of ['probe', 'reference', 'control'] as const) gate.callbacks[side].onLoad({ nativeEvent: { type: 'load', isTrusted: true, target: null } })
  expect((await gate.wait(signal())).loads).toEqual(['probe', 'reference', 'control'].map(side => ({ ...identity, side, ...source, event: 'load', origin: 'web-node', decoder: 'decode', complete: true, trusted: true })))
  gate.dispose()
})

it.each(['web', 'ios', 'android'] as const)('%s 保存早于 wait 的真实 load，回调保持稳定', async (platform) => {
  const gate = createImageReadiness(identity, platform, webHost)
  const callback = gate.callbacks.probe.onLoad
  for (const side of ['probe', 'reference', 'control'] as const) gate.callbacks[side].onLoad(platform === 'web' ? webEvent() : { nativeEvent: { source } })
  expect((await gate.wait(signal())).loads).toEqual(['probe', 'reference', 'control'].map(side => ({ ...identity, side, ...source, event: 'load', ...(platform === 'web' ? { origin: 'web-node', decoder: 'decode', complete: true, trusted: true } : { origin: 'native-source' }) })))
  expect(gate.callbacks.probe.onLoad).toBe(callback)
  gate.dispose()
})

it('完成解码时复制 Web 节点数值，后续宿主改变不改原始证据', async () => {
  const node = { ...image }
  const host = { isConnected: true, querySelectorAll: () => [node] }
  const gate = createImageReadiness(identity, 'web', () => host)
  for (const side of ['probe', 'reference', 'control'] as const) gate.callbacks[side].onLoad(webEvent())
  await gate.wait(signal())
  node.naturalWidth = 99
  expect((await gate.wait(signal())).loads.every(load => load.width === 16)).toBe(true)
  gate.dispose()
})

it.each(['web', 'ios'] as const)('%s 禁止从配置尺寸或另一平台事件兜底', async (platform) => {
  const gate = createImageReadiness(identity, platform, webHost)
  gate.callbacks.probe.onLoad(platform === 'web' ? { nativeEvent: { source } } : webEvent())
  await expect(gate.wait(signal())).rejects.toThrow(/真实 load|实际解码尺寸/)
  gate.dispose()
})

it('onError 在 wait 前抵达也进入失败通道，不产生未处理拒绝', async () => {
  const gate = createImageReadiness(identity, 'web', webHost)
  gate.callbacks.probe.onError({ nativeEvent: { error: 'decode failed' } })
  await expect(gate.wait(signal())).rejects.toThrow(/decode failed/)
  gate.dispose()
})

it('重复 load 不能替代其他 side 的加载', async () => {
  const gate = createImageReadiness(identity, 'web', webHost)
  gate.callbacks.probe.onLoad(webEvent())
  gate.callbacks.probe.onLoad(webEvent())
  await expect(gate.wait(signal())).rejects.toThrow(/重复/)
  gate.dispose()
})

it('等待有固定预算；onLoadEnd 不作为成功', async () => {
  vi.useFakeTimers()
  const gate = createImageReadiness(identity, 'web')
  expect(gate.callbacks.probe).not.toHaveProperty('onLoadEnd')
  const rejected = expect(gate.wait(signal())).rejects.toThrow(/5000ms/)
  await vi.advanceTimersByTimeAsync(5_000)
  await rejected
  expect(vi.getTimerCount()).toBe(0)
  gate.dispose()
})

it('取消清除定时器，旧实例迟到事件不能解锁新阶段', async () => {
  vi.useFakeTimers()
  const old = createImageReadiness(identity, 'web', webHost)
  const controller = new AbortController()
  const rejected = expect(old.wait(controller.signal)).rejects.toThrow(/ended/)
  controller.abort(new Error('ended'))
  old.dispose()
  await rejected
  const next = createImageReadiness({ ...identity, revision: 'next' }, 'web', webHost)
  for (const side of ['probe', 'reference', 'control'] as const) old.callbacks[side].onLoad(webEvent())
  const pending = next.wait(signal())
  const completed = vi.fn()
  void pending.then(completed)
  await Promise.resolve()
  expect(completed).not.toHaveBeenCalled()
  for (const side of ['probe', 'reference', 'control'] as const) next.callbacks[side].onLoad(webEvent())
  expect((await pending).loads.every(load => load.revision === 'next')).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  next.dispose()
})
