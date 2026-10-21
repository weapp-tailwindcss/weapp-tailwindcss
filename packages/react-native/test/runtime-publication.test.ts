import { afterEach, expect, it, vi } from 'vitest'
import { compileNativeStylesheet } from '../src/compiler'
import { createNativeStyleRuntime, getManifest, getPublication, setManifest, setStyleSheetFactory, tw } from '../src/runtime'

afterEach(() => setStyleSheetFactory(styles => styles))

it('没有 manifest 时不能安装发布身份', () => {
  expect(() => createNativeStyleRuntime(undefined, { revision: 'orphan', manifestSha256: 'a'.repeat(64) })).toThrow('manifest')
})

it('宿主可规范化自有 styles 副本，但不能改变已安装 manifest', () => {
  setStyleSheetFactory((styles) => {
    for (const style of Object.values(styles)) { style.opacity = 0.5 }
    return styles
  })
  const source = compileNativeStylesheet('.probe { color: red }')
  const runtime = createNativeStyleRuntime(source)
  expect(runtime.tw('probe')).toEqual({ color: 'red', opacity: 0.5 })
  expect(runtime.getManifest()).toEqual(source)
  expect(Object.isFrozen(source)).toBe(false)
})

it('宿主 factory 在注册中替换时，旧结果不能标成新 factory 的版本', () => {
  const next = vi.fn(styles => styles)
  setStyleSheetFactory((styles) => {
    setStyleSheetFactory(next)
    return styles
  })
  const runtime = createNativeStyleRuntime(compileNativeStylesheet('.probe { color: red }'))
  runtime.tw('probe')
  expect(next).toHaveBeenCalledTimes(1)
})

it('宿主注册失败时保留已安装的 manifest、缓存和 important 元数据', () => {
  setStyleSheetFactory((styles) => {
    if (Object.values(styles).some(style => style.color === 'blue')) {
      throw new Error('host registration failed')
    }
    return styles
  })
  const runtime = createNativeStyleRuntime(compileNativeStylesheet('.probe { color: red !important; line-height: 1.5 }'))
  const before = runtime.getManifest()
  const style = runtime.tw('probe')
  const inline = { color: 'green', fontSize: 20 }
  const composed = runtime.composeStyle(style, inline)
  expect(() => runtime.setManifest(compileNativeStylesheet('.probe { color: blue }'))).toThrow('host registration failed')
  expect(runtime.getManifest()).toEqual(before)
  expect(runtime.tw('probe')).toBe(style)
  expect(runtime.composeStyle(style, inline)).toEqual(composed)
})

it('创建和更新独立实例不能覆盖顶层默认实例的 manifest', () => {
  setStyleSheetFactory(styles => styles)
  setManifest(compileNativeStylesheet('.probe { color: red }'))
  const runtime = createNativeStyleRuntime(compileNativeStylesheet('.probe { color: blue }'))
  runtime.setManifest(compileNativeStylesheet('.probe { color: green }'))
  expect(createNativeStyleRuntime(getManifest()).tw('probe')).toEqual({ color: 'red' })
  expect(tw('probe')).toEqual({ color: 'red' })
  expect(runtime.tw('probe')).toEqual({ color: 'green' })
})

it('调用方修改输入 manifest 不能改变已经安装的样式', () => {
  setStyleSheetFactory(styles => styles)
  const manifest = compileNativeStylesheet('.probe { color: red }')
  const runtime = createNativeStyleRuntime(manifest)
  for (const style of Object.values(manifest.styleSheet!)) {
    style.color = 'blue'
  }
  expect(runtime.tw('probe')).toEqual({ color: 'red' })
})

it('公开 getter 不能暴露可改变已安装规则的可变引用', () => {
  setStyleSheetFactory(styles => styles)
  const runtime = createNativeStyleRuntime(compileNativeStylesheet('.probe { color: red }'))
  const installed = runtime.getManifest()!
  expect(() => installed.classSet.push('unpublished')).toThrow(TypeError)
  expect(() => Object.values(installed.styleSheet!)[0]!.color = 'blue').toThrow(TypeError)
  expect(runtime.tw('probe')).toEqual({ color: 'red' })
})

it('发布身份属于已安装实例，失败不切换，匿名安装清除旧身份', () => {
  setStyleSheetFactory((styles) => {
    if (Object.values(styles).some(style => style.color === 'blue')) { throw new Error('host failed') }
    return styles
  })
  const original = { revision: 'first', manifestSha256: 'a'.repeat(64) }
  const runtime = createNativeStyleRuntime(compileNativeStylesheet('.probe { color: red }'), original)
  original.revision = 'mutated'
  expect(runtime.getPublication()).toEqual({ revision: 'first', manifestSha256: 'a'.repeat(64) })
  expect(() => runtime.setManifest(compileNativeStylesheet('.probe { color: blue }'), { revision: 'second', manifestSha256: 'b'.repeat(64) })).toThrow('host failed')
  expect(runtime.getPublication()?.revision).toBe('first')
  expect(() => runtime.getPublication()!.revision = 'mutated').toThrow(TypeError)
  runtime.setManifest(compileNativeStylesheet('.probe { color: green }'))
  expect(runtime.getPublication()).toBeUndefined()
  setManifest(compileNativeStylesheet('.probe { color: red }'), { revision: 'default', manifestSha256: 'c'.repeat(64) })
  runtime.setManifest(compileNativeStylesheet('.probe { color: green }'), { revision: 'instance', manifestSha256: 'd'.repeat(64) })
  expect(getPublication()?.revision).toBe('default')
})

it('无效发布身份必须在宿主注册前拒绝，不能改变旧样式', () => {
  const factory = vi.fn(styles => styles)
  setStyleSheetFactory(factory)
  const runtime = createNativeStyleRuntime(compileNativeStylesheet('.probe { color: red }'))
  expect(() => runtime.setManifest(compileNativeStylesheet('.probe { color: blue }'), { revision: 'next', manifestSha256: 'invalid' })).toThrow('发布身份')
  expect(factory).toHaveBeenCalledTimes(1)
  expect(runtime.tw('probe')).toEqual({ color: 'red' })
})
