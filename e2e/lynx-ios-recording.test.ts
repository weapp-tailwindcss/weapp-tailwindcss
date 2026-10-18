import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { recordIosVideo } from './lynx/ios-recording'

const { execa, kill } = vi.hoisted(() => ({ execa: vi.fn(), kill: vi.fn() }))
vi.mock('execa', () => ({ execa }))

beforeEach(() => {
  vi.useFakeTimers()
  execa.mockReturnValue(Object.assign(Promise.resolve(), { kill }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('keeps the native recording active until the real return evidence finishes', async () => {
  let complete!: () => void
  const nativeCompletion = new Promise<void>((resolve) => { complete = resolve })
  const waitForCompletion = vi.fn(() => nativeCompletion)
  const artifactDir = path.resolve('native-artifacts')
  const recording = recordIosVideo('current-device', artifactDir, 18, waitForCompletion)
  await vi.advanceTimersByTimeAsync(18_000)
  expect(waitForCompletion).toHaveBeenCalledOnce()
  expect(kill).not.toHaveBeenCalled()
  complete()
  await recording
  expect(execa).toHaveBeenCalledWith('xcrun', ['simctl', 'io', 'current-device', 'recordVideo', '--codec=h264', path.join(artifactDir, 'raw.mp4')], { reject: false })
  expect(kill).toHaveBeenCalledExactlyOnceWith('SIGINT')
})

it('stops recording on completion timeout and propagates the original evidence failure', async () => {
  const failure = new Error('等待 iOS 原生滚动完成超时')
  const recording = recordIosVideo('current-device', path.resolve('native-artifacts'), 18, async () => { throw failure })
  const assertion = expect(recording).rejects.toBe(failure)
  await vi.advanceTimersByTimeAsync(18_000)
  await assertion
  expect(kill).toHaveBeenCalledExactlyOnceWith('SIGINT')
})

it('keeps the requested duration for captures without native scrolling', async () => {
  const recording = recordIosVideo('current-device', path.resolve('native-artifacts'), 8)
  await vi.advanceTimersByTimeAsync(7999)
  expect(kill).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  await recording
  expect(kill).toHaveBeenCalledExactlyOnceWith('SIGINT')
})
