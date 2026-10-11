import { afterEach, expect, it, vi } from 'vitest'
import { waitForTaroComponents } from '../component-ready.mjs'
import { readPageSnapshot } from '../page-snapshot.mjs'

afterEach(() => vi.unstubAllGlobals())

it('已挂载样式保留浏览器不认识的小程序单位，计算样式仍独立采样', async () => {
  const element = { textContent: 'current', isConnected: true, dataset: { twMatrix: 'initial' }, classList: ['h-safe'], children: [], tagName: 'DIV' }
  vi.stubGlobal('document', {
    getElementById: () => element, body: { querySelectorAll: () => [element] }, readyState: 'complete',
    styleSheets: [{ ownerNode: { tagName: 'STYLE', textContent: '.h-safe{height:64rpx}' }, cssRules: [{ cssText: '.h-safe {}' }] }],
  })
  vi.stubGlobal('getComputedStyle', () => ({ height: '18px' }))
  const snapshot = await readPageSnapshot({ expected: { height: 'h-[64rpx]' }, round: 'initial', marker: 'current' })
  expect(snapshot.styles).toEqual(['.h-safe{height:64rpx}'])
  expect(snapshot.computed.height.height).toBe('18px')
})

it('外链样式从当前挂载 sheet 提供 URL，不用丢失 rpx 的 CSSOM 冒充原始响应', async () => {
  const element = { textContent: 'current', isConnected: true, dataset: { twMatrix: 'initial' }, classList: ['safe'], children: [], tagName: 'DIV' }
  vi.stubGlobal('document', {
    getElementById: () => element, body: { querySelectorAll: () => [element] }, readyState: 'complete',
    styleSheets: [{ href: 'http://localhost/main.css?v=2', ownerNode: { tagName: 'LINK' }, cssRules: [{ cssText: '.safe {}' }] }],
  })
  vi.stubGlobal('location', { href: 'http://localhost/', origin: 'http://localhost' })
  vi.stubGlobal('getComputedStyle', () => ({ height: '18px' }))
  const snapshot = await readPageSnapshot({ expected: { height: 'h-[64rpx]' }, round: 'initial', marker: 'current' })
  expect(snapshot.styles).toEqual([])
  expect(snapshot.styleLinks).toEqual(['http://localhost/main.css?v=2'])
  expect(snapshot.computed.height.height).toBe('18px')
})

it('空文档的就绪结果不能复用于随后出现且尚未渲染的本轮节点', async () => {
  let element
  let release
  let rendered = false
  const readStyle = vi.fn(() => ({ display: rendered ? 'block' : 'inline' }))
  vi.stubGlobal('getComputedStyle', readStyle)
  vi.stubGlobal('customElements', { get: () => class {} })
  vi.stubGlobal('document', {
    getElementById: () => element,
    querySelectorAll: () => element ? [element] : [],
    body: { querySelectorAll: () => [element] },
    styleSheets: [], readyState: 'complete',
  })
  vi.stubGlobal('__WEAPP_DEMO_COST_COMPONENT_READY__', waitForTaroComponents)
  const input = { expected: { height: 'h-8' }, round: 'initial', marker: 'current', family: 'taro' }
  await waitForTaroComponents()
  await expect(readPageSnapshot(input)).rejects.toThrow('marker')
  element = {
    localName: 'taro-view-core', tagName: 'TARO-VIEW-CORE', textContent: 'current',
    isConnected: true, dataset: { twMatrix: 'initial' }, classList: ['h-8'], children: [],
    componentOnReady: () => new Promise(resolve => { release = resolve }),
  }
  const pending = readPageSnapshot(input)
  await Promise.resolve()
  expect(readStyle).not.toHaveBeenCalled()
  rendered = true
  release()
  expect((await pending).computed.height.display).toBe('block')
})

it.each(['detached', 'marker'])('等待渲染期间发生 %s 变化时拒绝采集过期页面', async (change) => {
  let release
  const element = { textContent: 'current', isConnected: true }
  vi.stubGlobal('document', { getElementById: () => element })
  vi.stubGlobal('__WEAPP_DEMO_COST_COMPONENT_READY__', () => new Promise(resolve => { release = resolve }))
  const readStyle = vi.fn()
  vi.stubGlobal('getComputedStyle', readStyle)
  const pending = readPageSnapshot({ expected: {}, marker: 'current', family: 'taro' })
  if (change === 'detached') element.isConnected = false
  else element.textContent = 'next'
  release()
  await expect(pending).rejects.toThrow('页面状态发生变化')
  expect(readStyle).not.toHaveBeenCalled()
})
