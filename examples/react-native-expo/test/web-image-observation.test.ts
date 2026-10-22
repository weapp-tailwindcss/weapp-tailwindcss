import { expect, it } from 'vitest'
import { nativeImageFixture } from '../src/compatibility/image-fixture'
import { createImageReadiness } from '../src/compatibility/image-readiness'
import { observeWebImage } from '../src/compatibility/web-image-observation'

const identity = { revision: 'baseline', id: 'sizing-size', phase: 'image' }
const event = { nativeEvent: { type: 'load', isTrusted: true, target: null } }
const uri = nativeImageFixture.uri
function fixture() {
  const node = { tagName: 'IMG', isConnected: true, complete: true, naturalWidth: 16, naturalHeight: 8, currentSrc: uri as string, src: uri as string, decode: async () => {} }
  const nodes = [node]
  const host = { isConnected: true, querySelectorAll: () => nodes }
  return { node, nodes, host }
}
function pending() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

it.each(['host', 'node', 'detached', 'source', 'declared-source'] as const)('decode 期间 %s 变更不能把旧加载绑定给新组件', async (kind) => {
  const original = fixture()
  const decode = pending()
  original.node.decode = () => decode.promise
  let current = original.host
  const result = observeWebImage(() => current, uri)
  const rejected = expect(result).rejects.toThrow(/宿主|图片|源/)
  if (kind === 'host') current = fixture().host
  if (kind === 'node') original.nodes[0] = fixture().node
  if (kind === 'detached') original.node.isConnected = false
  if (kind === 'source') original.node.currentSrc = 'data:changed'
  if (kind === 'declared-source') original.node.src = 'data:changed'
  decode.resolve()
  await rejected
})

it.each(['missing', 'multiple', 'incomplete', 'zero', 'nan', 'uri', 'no-decode', 'bad-decode'] as const)('拒绝 %s 图片观测，不能配置尺寸兜底或静默降级', async (kind) => {
  const { host, node, nodes } = fixture()
  if (kind === 'missing') nodes.length = 0
  if (kind === 'multiple') nodes.push(fixture().node)
  if (kind === 'incomplete') node.complete = false
  if (kind === 'zero') node.naturalHeight = 0
  if (kind === 'nan') node.naturalWidth = Number.NaN
  if (kind === 'uri') node.currentSrc = 'data:other'
  if (kind === 'no-decode') Reflect.deleteProperty(node, 'decode')
  if (kind === 'bad-decode') Object.assign(node, { decode: () => undefined })
  await expect(observeWebImage(() => host, uri)).rejects.toThrow(/Image/)
})

it('decode 异常原样失败，不能退回 onLoad 信号', async () => {
  const { host, node } = fixture()
  node.decode = async () => { throw new Error('owned-decode-failure') }
  await expect(observeWebImage(() => host, uri)).rejects.toThrow('owned-decode-failure')
})

it.each(['error', 'dispose', 'abort'] as const)('%s 先于 decode 完成时，迟到结果不能解锁所属阶段', async (kind) => {
  const { host, node } = fixture()
  const decode = pending()
  node.decode = () => decode.promise
  const gate = createImageReadiness(identity, 'web', () => host)
  const controller = new AbortController()
  for (const side of ['probe', 'reference', 'control'] as const) gate.callbacks[side].onLoad(event)
  const result = gate.wait(controller.signal)
  const rejected = expect(result).rejects.toThrow(/owned-failure|案例结束/)
  if (kind === 'error') gate.callbacks.probe.onError({ nativeEvent: { error: 'owned-failure' } })
  if (kind === 'dispose') gate.dispose()
  if (kind === 'abort') { controller.abort(new Error('owned-failure')); gate.dispose() }
  decode.resolve()
  await rejected
  gate.dispose()
})

it.each([false, undefined])('非可信 load 事件 %s 不能解锁实际宿主', async (isTrusted) => {
  const { host } = fixture()
  const gate = createImageReadiness(identity, 'web', () => host)
  gate.callbacks.probe.onLoad({ nativeEvent: { type: 'load', isTrusted } })
  await expect(gate.wait(new AbortController().signal)).rejects.toThrow(/真实 load/)
  gate.dispose()
})

it('旧实例卸载后 decode 拒绝被消费，不能污染新的加载阶段', async () => {
  const old = fixture()
  const decode = pending()
  old.node.decode = () => decode.promise
  const gate = createImageReadiness(identity, 'web', () => old.host)
  gate.callbacks.probe.onLoad(event)
  const rejected = expect(gate.wait(new AbortController().signal)).rejects.toThrow(/案例结束/)
  gate.dispose()
  decode.reject(new Error('old-decode-failure'))
  await rejected
  const current = fixture()
  const next = createImageReadiness({ ...identity, revision: 'next' }, 'web', () => current.host)
  for (const side of ['probe', 'reference', 'control'] as const) next.callbacks[side].onLoad(event)
  expect((await next.wait(new AbortController().signal)).loads.every(load => load.revision === 'next')).toBe(true)
  next.dispose()
})
