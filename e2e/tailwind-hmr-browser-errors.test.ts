import type { Page } from 'playwright'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { observeHmrBrowserErrors } from './tailwind-capabilities/hmr/browser-observer'

function fixture() {
  const page = new EventEmitter()
  const errors: string[] = []
  let stage = 'initial-navigation'
  const observer = observeHmrBrowserErrors(page as unknown as Page, () => stage, errors)
  return { page, errors, observer, stage: (value: string) => {
    stage = value
  } }
}

describe('HMR 浏览器错误原件', () => {
  it('保留完整 Chromium 的 404 来源、阶段及时间，不能仅保留通用文案', () => {
    const { page, observer, errors, stage } = fixture()
    const message = { type: () => 'error', text: () => 'Failed to load resource: 404', location: () => ({ url: 'http://127.0.0.1:5173/favicon.ico', lineNumber: 0, columnNumber: 0 }) }
    page.emit('console', message)
    stage('replaced')
    page.emit('console', { ...message, location: () => ({ url: 'http://127.0.0.1:5173/probe.js', lineNumber: 3, columnNumber: 2 }) })
    expect(observer.records).toMatchObject([
      { event: 'console-error', stage: 'initial-navigation', url: 'http://127.0.0.1:5173/favicon.ico', lineNumber: 0 },
      { event: 'console-error', stage: 'replaced', url: 'http://127.0.0.1:5173/probe.js', lineNumber: 3 },
    ])
    expect(observer.records.every(entry => Number.isFinite(Date.parse(entry.at)))).toBe(true)
    expect(errors.map(text => JSON.parse(text))).toEqual(observer.records)
    observer.dispose()
  })

  it('HTTP 失败、请求中断与页面异常都进入失败门禁，成功响应和普通日志不制造失败', () => {
    const { page, observer, errors } = fixture()
    const request = { url: () => 'http://127.0.0.1:5173/entry.css', resourceType: () => 'stylesheet', failure: () => ({ errorText: 'net::ERR_CONNECTION_RESET' }) }
    const response = { status: () => 404, statusText: () => 'Not Found', url: request.url, request: () => request }
    page.emit('response', { ...response, status: () => 200 })
    page.emit('console', { type: () => 'log' })
    expect(errors).toEqual([])
    page.emit('response', response)
    page.emit('requestfailed', request)
    page.emit('pageerror', new Error('owned-page-error'))
    expect(observer.records).toMatchObject([
      { event: 'http-error', status: 404, resourceType: 'stylesheet', url: request.url() },
      { event: 'request-failed', message: 'net::ERR_CONNECTION_RESET', url: request.url() },
      { event: 'page-error', message: expect.stringContaining('owned-page-error') },
    ])
    expect(errors).toHaveLength(3)
    observer.dispose()
  })

  it('收尾仅注销自己的观察器，不删除借用页面原有监听，也不记录关闭造成的迟到事件', () => {
    const { page, observer, errors } = fixture()
    const existing = () => {}
    page.on('pageerror', existing)
    observer.dispose()
    observer.dispose()
    expect(page.listeners('pageerror')).toEqual([existing])
    expect(['console', 'response', 'requestfailed'].map(event => page.listenerCount(event))).toEqual([0, 0, 0])
    page.emit('pageerror', new Error('after-close'))
    expect(errors).toEqual([])
  })
})
