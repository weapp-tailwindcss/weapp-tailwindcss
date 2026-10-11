import { expect, it } from 'vitest'
import { withSerialWatchers } from '../watch-lifetime.mjs'

it('三组 watcher 按指定轮换顺序串行存在，每组的全部操作复用同一个进程身份', async () => {
  const events = []
  let active = 0
  await withSerialWatchers(['static', 'enabled', 'native'], async (mode) => {
    expect(active++).toBe(0)
    events.push(`start:${mode}`)
    return { id: Symbol(mode), close: async () => { active--; events.push(`stop:${mode}`) } }
  }, async (mode, watcher) => {
    const identities = new Set()
    for (let round = 0; round < 22; round++) { expect(active).toBe(1); identities.add(watcher.id) }
    expect(identities.size).toBe(1)
    events.push(`measured:${mode}`)
  })
  expect(active).toBe(0)
  expect(events).toEqual(['start:static', 'measured:static', 'stop:static', 'start:enabled', 'measured:enabled', 'stop:enabled', 'start:native', 'measured:native', 'stop:native'])
})

it('语义失败仍关闭当前 watcher，不留下后台扫描或开始后续组', async () => {
  const events = []
  await expect(withSerialWatchers(['native', 'static', 'enabled'], async mode => {
    events.push(`start:${mode}`)
    return { close: async () => events.push(`stop:${mode}`) }
  }, async () => { throw new Error('marker 缺失') })).rejects.toThrow('marker 缺失')
  expect(events).toEqual(['start:native', 'stop:native'])
})
