import { afterEach, expect, it, vi } from 'vitest'
import { withAbortDeadline } from './framework-ide/abort'
import { restoreProbeSources, writeProbeSource } from './framework-ide/source-lifecycle'

const { write } = vi.hoisted(() => ({ write: vi.fn() }))
vi.mock('../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text', () => ({ writeFilePreserveEol: write }))

afterEach(() => {
  vi.resetAllMocks()
  vi.useRealTimers()
})

it('取消期间等待已开始写入的 promise 落定，随后才精确恢复原文', async () => {
  vi.useFakeTimers()
  const original = 'first\r\nsecond\n'
  let disk = original
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  write.mockImplementation(async (_file, content) => {
    if (content === 'mutated') {
      await pending
    }
    disk = content
  })
  const stop = vi.fn()
  const result = withAbortDeadline(10, 'deadline', async (signal) => {
    await writeProbeSource('page.vue', 'mutated', original, signal)
    await writeProbeSource('page.vue', 'late stage', original, signal)
  }).catch(error => error).finally(async () => {
    await restoreProbeSources(new Map([['page.vue', original]]), stop)
  })
  await vi.advanceTimersByTimeAsync(10)
  expect(write).toHaveBeenCalledTimes(1)
  expect(stop).not.toHaveBeenCalled()
  release()
  await expect(result).resolves.toMatchObject({ message: 'deadline' })
  expect(disk).toBe(original)
  expect(write).toHaveBeenCalledTimes(2)
  expect(write).toHaveBeenLastCalledWith('page.vue', original, original, { normalizeEol: false })
  expect(stop).toHaveBeenCalledOnce()
})

it('取消后不能启动新的源码写入', async () => {
  const controller = new AbortController()
  controller.abort(new Error('cancelled'))
  await expect(writeProbeSource('page.vue', 'late', 'original', controller.signal)).rejects.toThrow('cancelled')
  expect(write).not.toHaveBeenCalled()
})

it('写入在总超时后独立失败时，保留超时和文件系统错误', async () => {
  vi.useFakeTimers()
  let reject!: (error: Error) => void
  write.mockImplementation(() => new Promise<void>((_resolve, rejectPromise) => {
    reject = rejectPromise
  }))
  const result = withAbortDeadline(10, 'deadline', signal => writeProbeSource('page.vue', 'mutated', 'original', signal)).catch(error => error)
  await vi.advanceTimersByTimeAsync(10)
  reject(new Error('disk denied'))
  const error = await result
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.message).toContain('deadline')
  expect(error.message).toContain('disk denied')
})
