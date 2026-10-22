import { expect, it } from 'vitest'
import { preparePollingBaseline } from './rollup-polling-readiness.mjs'

function fixture(options = {}) {
  const raw = []
  const published = []
  let current = 0
  let elapsed = 0
  let output = { default: 0, observedMtime: 0 }
  const input = {
    raw,
    initialTime: 0,
    fixedTime: 1000,
    timeoutMs: 50,
    now: () => elapsed,
    pause: async () => { elapsed++ },
    async publish(time) {
      published.push(time)
      if (!(options.loseFirst && published.length === 1) && !options.noAck && !(options.noRestoreAck && time === 1000)) {
        raw.push({ curr: { mtimeMs: time }, prev: { mtimeMs: current } })
      }
      current = time
      if (!options.oldBuild) {
        output = { default: 0, observedMtime: time }
      }
    },
    readOutput: async () => output,
    isIdle: () => !options.busy,
  }
  return { input, published }
}

it('初始与恢复标识相同不能用旧构建证明恢复，也不能开始 probe', async () => {
  const { input, published } = fixture()
  input.initialTime = input.fixedTime
  await expect(preparePollingBaseline(input)).rejects.toThrow('初始与恢复标识必须不同')
  expect(published).toEqual([])
})

it('首个 probe 被原生初始采样吸收后，必须取得后续回执和恢复后的实际构建', async () => {
  const { input, published } = fixture({ loseFirst: true })
  await preparePollingBaseline(input)
  expect(published).toEqual([2000, 3000, 1000])
  expect(await input.readOutput()).toEqual({ default: 0, observedMtime: 1000 })
  const completed = [...published]
  await input.pause()
  expect(published).toEqual(completed)
})

it.each([
  [{ noAck: true }, 'native-baseline'],
  [{ noRestoreAck: true }, 'restore-metadata'],
  [{ oldBuild: true }, 'restore-build'],
  [{ busy: true }, 'restore-build'],
])('缺少真实握手、恢复构建或空闲状态时不能以旧结果放行（%j）', async (options, stage) => {
  const { input, published } = fixture(options)
  await expect(preparePollingBaseline(input)).rejects.toThrow(`polling readiness 超时：${stage}`)
  const failed = [...published]
  await input.pause()
  expect(published).toEqual(failed)
})

it('一次发布未结束时不启动后续 probe，迟到结束也不能追加新预算或遗留写入', async () => {
  const { input, published } = fixture()
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  input.publish = async (time) => {
    published.push(time)
    await gate
  }
  let elapsed = 0
  input.now = () => elapsed
  const pending = preparePollingBaseline(input)
  let settled = false
  void pending.then(() => {
    settled = true
  }, () => {
    settled = true
  })
  elapsed = 51
  await Promise.resolve()
  expect(settled).toBe(false)
  expect(published).toEqual([2000])
  release()
  await expect(pending).rejects.toThrow('native-baseline')
  await input.pause()
  expect(published).toEqual([2000])
})
