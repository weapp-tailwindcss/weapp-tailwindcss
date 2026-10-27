import { describe, expect, it } from 'vitest'
import { snapshotConfiguration } from '@/compiler/configuration-snapshot'
import { stableSerialize } from '@/utils/stable-serialize'

describe('生成服务的配置指纹', () => {
  it('集合内容参与身份，映射和集合的插入顺序不改变语义，数组保留顺序', () => {
    expect(stableSerialize(new Set(['a']))).not.toBe(stableSerialize(new Set(['b'])))
    expect(stableSerialize(new Set(['a', 'b']))).toBe(stableSerialize(new Set(['b', 'a'])))
    expect(stableSerialize(new Map([['a', 1], ['b', 2]]))).toBe(stableSerialize(new Map([['b', 2], ['a', 1]])))
    expect(stableSerialize(['a', 'b'])).not.toBe(stableSerialize(['b', 'a']))
    expect(stableSerialize(new Set(['a']))).not.toBe(stableSerialize(['a']))
  })
  it('相同源码但不同捕获值的回调保持独立，内部快照不冻结调用方', () => {
    const callback = (value: string) => () => value
    const left = callback('left')
    const right = callback('right')
    expect(left.toString()).toBe(right.toString())
    expect(stableSerialize({ callback: left })).not.toBe(stableSerialize({ callback: right }))
    const input = { callbacks: new Map([['current', left]]), names: new Set(['a']), order: ['a', 'b'] }
    const snapshot = snapshotConfiguration(input)
    const fingerprint = stableSerialize(snapshot)
    input.callbacks.set('current', right)
    input.names.add('b')
    input.order.reverse()
    expect(stableSerialize(snapshot)).toBe(fingerprint)
    expect(stableSerialize(input)).not.toBe(fingerprint)
    expect(Object.isFrozen(input)).toBe(false)
  })
})
