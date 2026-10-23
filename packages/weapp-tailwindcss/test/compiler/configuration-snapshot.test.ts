import { describe, expect, it } from 'vitest'
import { snapshotConfiguration } from '@/compiler/configuration-snapshot'

describe('configuration collection snapshots', () => {
  it('isolates nested collections and prevents mutations through their public methods', () => {
    const value = { spacing: '1rpx' }
    const map = new Map([['--spacing', value]])
    const set = new Set([value])
    const snapshot = snapshotConfiguration({ map, set })
    value.spacing = '2rpx'
    map.set('--next', value)
    set.clear()

    expect(snapshot.map.get('--spacing')).toEqual({ spacing: '1rpx' })
    expect(snapshot.map.size).toBe(1)
    expect([...snapshot.set]).toEqual([{ spacing: '1rpx' }])
    expect(Object.isFrozen(snapshot.map)).toBe(true)
    expect(Object.isFrozen(snapshot.set)).toBe(true)
    expect(() => snapshot.map.set('--next', value)).toThrow(TypeError)
    expect(() => snapshot.map.delete('--spacing')).toThrow(TypeError)
    expect(() => snapshot.set.add(value)).toThrow(TypeError)
    expect(() => snapshot.set.clear()).toThrow(TypeError)
    snapshot.map.forEach((_value, _key, collection) => expect(collection).toBe(snapshot.map))
    snapshot.set.forEach((_value, _key, collection) => expect(collection).toBe(snapshot.set))
    expect(Object.isFrozen(value)).toBe(false)
    expect(Object.isFrozen(map)).toBe(false)
  })

  it('preserves shared references and cycles without exposing mutable collection targets', () => {
    const map = new Map<string, unknown>()
    const set = new Set<unknown>()
    map.set('self', map)
    map.set('set', set)
    set.add(map)
    const snapshot = snapshotConfiguration(map)
    expect(snapshot.get('self')).toBe(snapshot)
    expect([...(snapshot.get('set') as Set<unknown>)]).toEqual([snapshot])
    expect(() => Map.prototype.set.call(snapshot, 'next', 1)).toThrow(TypeError)
  })
})
