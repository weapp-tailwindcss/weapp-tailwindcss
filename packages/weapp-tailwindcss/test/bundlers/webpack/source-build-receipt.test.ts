import { expect, it } from 'vitest'
import { createSourceBuildReceipt } from './source-build-receipt'

it('路径相同但来源仍为上一轮的回调不能提前完成新请求', async () => {
  const pending = createSourceBuildReceipt('.fixture-source-1 {')
  let completed = false
  void pending.promise.then(() => {
    completed = true
  })
  expect(pending.accept({ source: '.fixture-source-0 {}', css: '旧产物' })).toBe(false)
  await Promise.resolve()
  expect(completed).toBe(false)
  const current = { source: '.fixture-source-1 {}', css: '本轮产物' }
  expect(pending.accept(current)).toBe(true)
  await expect(pending.promise).resolves.toBe(current)
})

it('来源已经更新时立即交付错误 CSS，由行为断言报告失败', async () => {
  const pending = createSourceBuildReceipt('.fixture-source-1 {')
  const incorrect = { source: '.fixture-source-1 {}', css: '未保留未知消费的错误产物' }
  expect(pending.accept(incorrect)).toBe(true)
  await expect(pending.promise).resolves.toBe(incorrect)
  expect(pending.accept({ ...incorrect, css: '后续正确产物' })).toBe(false)
})

it('恢复相同样式时使用新来源标识，初始回调不能完成恢复请求', async () => {
  const pending = createSourceBuildReceipt('.fixture-source-2 {')
  expect(pending.accept({ source: '.fixture-source-0 {}', css: '相同样式' })).toBe(false)
  const restored = { source: '.fixture-source-2 {}', css: '相同样式' }
  expect(pending.accept(restored)).toBe(true)
  await expect(pending.promise).resolves.toBe(restored)
})

it('其他轮次的数字前缀不能冒充当前来源标识', async () => {
  const pending = createSourceBuildReceipt('.fixture-source-1 {')
  expect(pending.accept({ source: '.fixture-source-10 {}', css: '其他轮次' })).toBe(false)
  const current = { source: '.fixture-source-1 {}', css: '当前轮次' }
  expect(pending.accept(current)).toBe(true)
  await expect(pending.promise).resolves.toBe(current)
})
