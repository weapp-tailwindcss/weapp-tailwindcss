import type { Page } from '@playwright/test'
import type { CaptureWindow } from '../tests/helpers/full-page/monitor'
import type { NativeCaptureEvidence } from '../tests/helpers/full-page/native'
import { EventEmitter } from 'node:events'
import { expect, it } from 'vitest'
import { watchCaptureDocument } from '../tests/helpers/full-page/document'
import { validCaptureWindow } from '../tests/helpers/full-page/monitor'
import { validNativeSample } from '../tests/helpers/full-page/native'

function window(overrides: Partial<CaptureWindow> = {}): CaptureWindow {
  return {
    initialized: true, completed: true, frames: 2, events: 0, overflow: false,
    disturbances: [], geometry: { width: 1280, height: 3000 }, fingerprint: 'same-document-geometry', ...overrides,
  }
}

function sample(overrides: Partial<NativeCaptureEvidence> = {}): NativeCaptureEvidence {
  const ready = { ready: true, reason: '正常高亮', expected: 'first', expectedHeading: 'first', actual: ['first'] }
  return { window: window(), before: ready, after: ready, ...overrides }
}

it('只有完整捕获期证据和前后有效语义能够接收样本', () => {
  expect(validNativeSample(sample())).toBe(true)
})

it.each([
  '捕获期间视口、DPR 或滚动位置改变',
  '捕获期间 TOC 或标题节点被插入、移除或重新挂载',
  '捕获期间 TOC active 属性发生改变',
  '捕获期间 TOC transitionrun',
  'TOC 捕获期间存在未完成动画',
  '捕获期间只读观测失败',
])('前后语义与尺寸都恢复也不能接收瞬态：%s', (reason) => {
  expect(validNativeSample(sample({ window: window({ disturbances: [reason] }) }))).toBe(false)
})

it.each([
  null, undefined,
  window({ initialized: false }),
  window({ completed: false }),
  window({ frames: 1 }),
  window({ overflow: true }),
  window({ fingerprint: '' }),
  window({ geometry: { width: 0, height: 3000 } }),
  window({ geometry: { width: 1280, height: Number.NaN } }),
])('缺失、未排空、丢记录或无效几何必须拒绝：%j', (value) => {
  expect(validCaptureWindow(value)).toBe(false)
})

it.each(['before', 'after'] as const)('捕获期无扰动也不能替代%s语义检查', (key) => {
  expect(validNativeSample(sample({ [key]: null }))).toBe(false)
  expect(validNativeSample(sample({ [key]: { ready: false } as NativeCaptureEvidence['before'] }))).toBe(false)
})

it('两端各自ready但expectedHeading变化也不能视为同一语义样本', () => {
  const value = sample()
  value.after = { ...value.before!, expectedHeading: 'other' }
  expect(validNativeSample(value)).toBe(false)
})

it('两张相同PNG之间发生同URL reload也必须阻断稳定pair并释放监听', () => {
  const main = { url: () => 'https://same.fixture/doc' }
  const page = Object.assign(new EventEmitter(), { mainFrame: () => main })
  const document = watchCaptureDocument(page as unknown as Page)
  try {
    expect(() => document.assert()).not.toThrow()
    page.emit('framenavigated', { url: main.url })
    expect(() => document.assert()).not.toThrow()
    page.emit('framenavigated', main)
    expect(() => document.assert()).toThrow('主 document 已导航或重新加载')
  }
  finally {
    document.close()
  }
  expect(page.eventNames()).toEqual([])
})

it.each(['close', 'crash'])('窗口间页面%s也不能沿用前张PNG', (event) => {
  const page = Object.assign(new EventEmitter(), { mainFrame: () => ({}) })
  const document = watchCaptureDocument(page as unknown as Page)
  try {
    page.emit(event)
    expect(() => document.assert()).toThrow('页面已关闭或崩溃')
  }
  finally {
    document.close()
  }
  expect(page.eventNames()).toEqual([])
})
