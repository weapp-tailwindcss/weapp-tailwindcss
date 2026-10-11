import { describe, expect, it } from 'vitest'
import { rewriteAppMarker } from './hbuilderx-local/app-marker'

const anchor = '<view class="page">content</view>'
const initial = { className: 'bg-[#123456]', textClassName: 'text-white', text: 'initial' }

describe('App 结构与视觉探针的共同身份', () => {
  it('首次插入并反复替换同一个可查询节点', () => {
    const source = `<template>${anchor}</template>`
    const first = rewriteAppMarker(source, [anchor], initial)
    const updated = rewriteAppMarker(first, [anchor], { ...initial, text: 'updated' })
    expect(updated.match(/id="native-hmr-probe"/g)).toHaveLength(1)
    expect(updated).toContain('updated</text>')
    expect(updated).not.toContain('initial</text>')
    expect(updated).toContain(anchor)
    expect(updated.match(/margin-bottom: 40px/g)).toHaveLength(1)
  })

  it('替换 demo 持久探针，避免视觉测试重复插入或读取旧文字', () => {
    const source = `<template><view id="native-hmr-probe" class="hbuilderx-app-native-hmr-probe old"><text>original</text></view>${anchor}</template>`
    const result = rewriteAppMarker(source, [], { ...initial, className: `hbuilderx-app-native-hmr-probe ${initial.className}` })
    expect(result.match(/hbuilderx-app-native-hmr-probe/g)).toHaveLength(1)
    expect(result.match(/id="native-hmr-probe"/g)).toHaveLength(1)
    expect(result).not.toContain('original')
  })

  it('迁移旧探针但保留相邻业务节点', () => {
    const source = `<template>\n <view class="old"><text class="text">hbuilderx-app-dynamic-old</text></view>${anchor}</template>`
    const result = rewriteAppMarker(source, [anchor], initial)
    expect(result).not.toContain('hbuilderx-app-dynamic-old')
    expect(result).toContain(anchor)
  })

  it('身份歧义或锚点缺失时拒绝继续', () => {
    const first = rewriteAppMarker(anchor, [anchor], initial)
    expect(() => rewriteAppMarker(first + first, [anchor], initial)).toThrow('多个受管探针')
    expect(() => rewriteAppMarker('<template />', [anchor], initial)).toThrow('插入锚点')
  })
})
