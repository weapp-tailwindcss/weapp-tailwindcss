import { expect, it } from 'vitest'
import { decode, encode } from '../capture.cjs'

it('往返保存常量 matcher 的行为，保留嵌套配置且不执行回调', () => {
  for (const matcher of [() => true, () => false, function () { return true }]) {
    const encoded = JSON.parse(JSON.stringify(encode({ matcher, nested: [/pattern/i] })))
    const restored = decode(encoded, '/capture', '/consumer')
    expect(restored.matcher('app.css')).toBe(matcher('app.css'))
    expect(restored.nested[0]).toEqual(/pattern/i)
  }
})

it('仍拒绝闭包、参数、全局状态和副作用，不通过执行函数推测是否恒定', () => {
  let called = false
  const closed = true
  for (const matcher of [() => closed, value => value, () => globalThis.flag, () => { called = true; return true }]) {
    expect(() => encode({ matcher })).toThrow('闭包')
  }
  expect(called).toBe(false)
})
