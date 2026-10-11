import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { waitForTaroComponents } from '../component-ready.mjs'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
beforeEach(() => { vi.stubGlobal('customElements', { get: () => class {} }) })

it('网络与文档已就绪时仍等待所有组件的首轮渲染，不把尚未应用的样式计作完成', async () => {
  let ready
  let completed = false
  const component = { localName: 'taro-view-core', componentOnReady: () => new Promise(resolve => { ready = resolve }) }
  vi.stubGlobal('document', { readyState: 'complete', querySelectorAll: () => [component, { localName: 'div' }] })
  const waiting = waitForTaroComponents().then(() => { completed = true })
  await Promise.resolve()
  expect(completed).toBe(false)
  ready(component)
  await waiting
  expect(completed).toBe(true)
})

it('未注册与渲染拒绝保留失败，组件永不就绪也不会让外层轮询无限挂起', async () => {
  vi.stubGlobal('document', { querySelectorAll: () => [{ localName: 'taro-view-core' }] })
  customElements.get = () => undefined
  await expect(waitForTaroComponents()).rejects.toThrow('尚未注册')
  customElements.get = () => class {}
  document.querySelectorAll = () => [{ localName: 'taro-view-core', componentOnReady: () => Promise.reject(new Error('render failed')) }]
  await expect(waitForTaroComponents()).rejects.toThrow('render failed')
  vi.useFakeTimers()
  document.querySelectorAll = () => [{ localName: 'taro-view-core', componentOnReady: () => new Promise(() => {}) }]
  const assertion = expect(waitForTaroComponents(100)).rejects.toThrow('首轮渲染')
  await vi.advanceTimersByTimeAsync(100)
  await assertion
  expect(vi.getTimerCount()).toBe(0)
})

it('现代适配器没有就绪 Promise 时，必须实际挂载组件声明的样式，支持 shadow root', async () => {
  const css = 'taro-view-core{display:block}'
  customElements.get = () => class { static style = css }
  const element = { localName: 'taro-view-core' }
  vi.stubGlobal('document', { styleSheets: [], querySelectorAll: () => [element] })
  await expect(waitForTaroComponents()).rejects.toThrow('样式尚未挂载')
  document.styleSheets = [{ ownerNode: { textContent: 'unrelated{display:block}' } }]
  await expect(waitForTaroComponents()).rejects.toThrow('样式尚未挂载')
  element.shadowRoot = { styleSheets: [{ ownerNode: { textContent: css } }] }
  await expect(waitForTaroComponents()).resolves.toBeUndefined()
  delete element.shadowRoot
  document.styleSheets = [{ ownerNode: { textContent: css } }]
  await expect(waitForTaroComponents()).resolves.toBeUndefined()
})
