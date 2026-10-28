import { expect, it } from 'vitest'
import { createUniInputObserver } from '../scripts/diagnostics/uni-observer.mjs'

function fixture(reject = false) {
  const events = []
  const observer = createUniInputObserver({ root: '.', phase: () => ({ type: 'mutation-write', round: 1 }), operations: { emit(name, details, durationMs) {
    if (reject && name.endsWith('.span')) throw new Error('writer failed')
    events.push({ name, details, durationMs })
    return events.length
  } } })
  return { observer, events }
}

it('每个叶子调用只写一次终结span，原details、起止及重叠区间完整保留', async () => {
  const { observer, events } = fixture()
  await observer.bundle(async () => {
    await observer.async('phase.outer', { file: 'asset.wxss', sourceModule: 'outer.ts' }, async () => {
      observer.sync('phase.inner', { file: 'asset.wxss', sourceModule: 'inner.ts' }, () => 1)
    })
  })
  const spans = events.filter(event => event.name.endsWith('.span'))
  expect(spans).toHaveLength(2)
  expect(events.some(event => event.name.startsWith('uni.phase.') && event.name.endsWith('.start'))).toBe(false)
  expect(spans[0].details).toMatchObject({ file: 'asset.wxss', sourceModule: 'inner.ts', outcome: 'success' })
  expect(spans[1].details.startedAtMonotonicMs).toBeLessThanOrEqual(spans[0].details.startedAtMonotonicMs)
  expect(spans[1].details.endedAtMonotonicMs).toBeGreaterThanOrEqual(spans[0].details.endedAtMonotonicMs)
  for (const event of spans) expect(event.durationMs).toBe(event.details.endedAtMonotonicMs - event.details.startedAtMonotonicMs)
  expect(observer.summary().spans).toEqual({ started: 2, completed: 2, pending: [] })
})

it.each([false, undefined, null, 0, new Error('leaf failed', { cause: new Error('backend failed') })])('叶子抛出%s时原值与错误span均保留', async (primary) => {
  const { observer, events } = fixture()
  await expect(observer.bundle(async () => observer.sync('phase.leaf', { file: 'a.js' }, () => { throw primary }))).rejects.toBe(primary)
  expect(events.find(event => event.name === 'uni.phase.leaf.span').details).toMatchObject({ file: 'a.js', outcome: 'failure', error: primary instanceof Error ? { message: 'leaf failed', cause: { message: 'backend failed' } } : { thrownType: typeof primary } })
  expect(observer.summary().spans.pending).toEqual([])
})

it('未终结Promise保持pending，不伪造关闭；旁观返回身份和拒绝值保持原样', async () => {
  const { observer, events } = fixture()
  let reject
  const promise = new Promise((_resolve, fail) => { reject = fail })
  await observer.bundle(async () => {
    expect(observer.observe('phase.awaited', { file: 'a.js' }, () => promise)).toBe(promise)
    expect(observer.summary().spans.pending).toHaveLength(1)
  })
  expect(observer.summary().spans.completed).toBe(0)
  const caught = promise.catch(error => error)
  reject('original rejection')
  expect(await caught).toBe('original rejection')
  await Promise.resolve()
  expect(events.find(event => event.name === 'uni.phase.awaited.span').details.error).toEqual({ thrownType: 'string', value: 'original rejection' })
})

it('span落盘失败保留pending与首抛出值，不能虚报completed', async () => {
  const { observer } = fixture(true)
  const primary = new Error('original leaf')
  await expect(observer.bundle(async () => observer.sync('phase.failed', { file: 'a.js' }, () => { throw primary }))).rejects.toBe(primary)
  expect(observer.summary()).toMatchObject({ spans: { started: 1, completed: 0, pending: [{ name: 'phase.failed', details: { file: 'a.js' } }] } })
  expect(observer.summary().recordingError).toContain('保留原抛出值')
})
