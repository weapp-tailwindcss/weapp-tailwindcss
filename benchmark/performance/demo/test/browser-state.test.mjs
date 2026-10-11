import { EventEmitter } from 'node:events'
import { expect, it } from 'vitest'
import { trackBrowserState } from '../browser-state.mjs'

it('预构建重载替换旧文档请求，但不放过新文档尚未完成的模块', () => {
  const page = new EventEmitter()
  const frame = {}
  page.mainFrame = () => frame
  const state = trackBrowserState(page)
  const document = { isNavigationRequest: () => true, frame: () => frame }
  const response = status => ({ request: () => document, status: () => status })
  const module = { resourceType: () => 'script' }
  page.emit('response', response(200))
  page.emit('request', module)
  const oldSocket = new EventEmitter()
  page.emit('websocket', oldSocket)
  oldSocket.emit('framereceived', { payload: '{"type":"connected"}' })
  expect(state.transportReady()).toBe(true)
  page.emit('framenavigated', frame)
  expect(state.documents()).toBe(1)
  expect(state.pending.size).toBe(1)
  page.emit('response', response(503))
  expect(state.pending.size).toBe(1)
  page.emit('response', response(200))
  expect(state.documents()).toBe(2)
  expect(state.pending.size).toBe(0)
  oldSocket.emit('framereceived', { payload: '{"type":"connected"}' })
  expect(state.transportReady()).toBe(false)
  const next = { resourceType: () => 'stylesheet' }
  page.emit('request', next)
  page.emit('requestfinished', module)
  expect(state.pending.has(next)).toBe(true)
  page.emit('requestfinished', next)
  expect(state.pending.size).toBe(0)
  const nextSocket = new EventEmitter()
  page.emit('websocket', nextSocket)
  nextSocket.emit('framereceived', { payload: '{"type":"connected"}' })
  expect(state.transportReady()).toBe(true)
})

it('当前文档请求失败保留错误证据，不能通过清空队列伪装成功', () => {
  const page = new EventEmitter()
  const state = trackBrowserState(page)
  const request = { resourceType: () => 'script', url: () => 'http://localhost/module.js', failure: () => ({ errorText: 'ERR_FAILED' }) }
  page.emit('request', request)
  page.emit('requestfailed', request)
  expect(state.pending.size).toBe(0)
  expect(state.errors).toEqual(['http://localhost/module.js: ERR_FAILED'])
})

it.each(['image', 'font'])('页面结构与布局采样必须等待 %s 资源', (type) => {
  const page = new EventEmitter()
  const state = trackBrowserState(page)
  const request = { resourceType: () => type }
  page.emit('request', request)
  expect(state.pending.has(request)).toBe(true)
  page.emit('requestfinished', request)
  expect(state.pending.size).toBe(0)
})

it('只读取当前文档已挂载链接的原始响应，保留 CSSOM 丢弃的单位且拒绝旧响应', async () => {
  const page = new EventEmitter()
  const frame = {}
  page.mainFrame = () => frame
  const state = trackBrowserState(page)
  const url = 'http://localhost/main.css?v=1'
  let complete
  const request = { resourceType: () => 'stylesheet', url: () => url, isNavigationRequest: () => false }
  page.emit('response', { request: () => request, status: () => 200, text: () => new Promise(resolve => { complete = resolve }) })
  const reading = state.linkedStyles([url])
  complete('.safe{height:64rpx}')
  expect(await reading).toEqual(['.safe{height:64rpx}'])
  await expect(state.linkedStyles(['http://localhost/main.css?v=2'])).rejects.toThrow('缺少本轮')
  page.emit('response', { status: () => 200, request: () => ({ isNavigationRequest: () => true, frame: () => frame }) })
  await expect(state.linkedStyles([url])).rejects.toThrow('缺少本轮')
})
