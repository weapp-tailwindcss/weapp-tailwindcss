import type { Page } from 'playwright'
import type { MediaObservation } from './tailwind-capabilities/web-native-media/types'
import { runInNewContext } from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'
import { waitForFrameProgress } from './tailwind-capabilities/browser/frames'
import { observeNativeContrast } from './tailwind-capabilities/web-native-media/native'
import { syntheticMedia } from './tailwind-capabilities/web-native-media/test-fixture'

afterEach(() => {
  vi.useRealTimers()
})
function setup(mode: 'normal' | 'navigation' = 'normal') {
  const fixture = syntheticMedia()
  let index = 0
  const session = { send: vi.fn().mockResolvedValue({}), detach: vi.fn().mockResolvedValue(undefined) }
  const page = {
    context: () => ({ newCDPSession: vi.fn().mockResolvedValue(session) }),
    evaluate: vi.fn(async (callback, input) => {
      if (callback === waitForFrameProgress) {
        return fixture.observation.states[index]!.frames
      }
      if (Array.isArray(input)) {
        return 100
      }
      if (mode === 'navigation') {
        return runInNewContext(`(${String(callback)})(input)`, { input, performance: { timeOrigin: 200 } })
      }
      return fixture.observation.states[index++]!
    }),
  } as unknown as Page
  const observation: MediaObservation = { states: [], cleanup: { detached: false, errors: [] } }
  return { session, page, observation }
}

it('五个状态后恢复override并释放本page协议连接', async () => {
  const { session, page, observation } = setup()
  await observeNativeContrast(page, observation, async name => `${name}.png`, 'unit-media', 'unit-css-hash')
  expect(session.send).toHaveBeenCalledTimes(6)
  expect(session.send).toHaveBeenLastCalledWith('Emulation.setEmulatedMedia', { media: '', features: [] })
  expect(session.detach).toHaveBeenCalledTimes(1)
  expect(observation.cleanup).toMatchObject({ detached: true, errors: [] })
})

it('采集、恢复、detach三种错误全部保留且不互相阻止清理', async () => {
  const { session, page, observation } = setup()
  session.send.mockResolvedValueOnce({}).mockRejectedValue(new Error('reset failed'))
  session.detach.mockRejectedValue(new Error('detach failed'))
  const error = await observeNativeContrast(page, observation, async () => {
    throw new Error('capture failed')
  }, 'unit-media', 'unit-css-hash').catch(error => error) as AggregateError
  expect(error.errors.map(String)).toEqual([expect.stringContaining('capture failed'), expect.stringContaining('reset failed'), expect.stringContaining('detach failed')])
  expect(session.detach).toHaveBeenCalledTimes(1)
  expect(observation.cleanup.errors).toHaveLength(2)
})

it('RAF停摆有界失败后仍恢复并detach', async () => {
  vi.useFakeTimers()
  const { session, page, observation } = setup()
  vi.mocked(page.evaluate).mockImplementation(() => new Promise(() => {}))
  const result = observeNativeContrast(page, observation, async () => '', 'unit-media', 'unit-css-hash').catch(error => error)
  await vi.advanceTimersByTimeAsync(5_000)
  expect(String(await result)).toContain('媒体绘制观察')
  expect(session.send).toHaveBeenLastCalledWith('Emulation.setEmulatedMedia', { media: '', features: [] })
  expect(session.detach).toHaveBeenCalledTimes(1)
})

it('恢复协议停摆也有界结束并继续detach', async () => {
  vi.useFakeTimers()
  const { session, page, observation } = setup()
  session.send.mockResolvedValueOnce({}).mockImplementation(() => new Promise(() => {}))
  const result = observeNativeContrast(page, observation, async () => {
    throw new Error('capture failed')
  }, 'unit-media', 'unit-css-hash').catch(error => error)
  await vi.advanceTimersByTimeAsync(5_000)
  expect(String(await result)).toContain('媒体原生协议')
  expect(session.detach).toHaveBeenCalledTimes(1)
})

it('帧与样式阶段之间的同 URL reload 必须失败，并恢复原生媒体', async () => {
  const { session, page, observation } = setup('navigation')
  await expect(observeNativeContrast(page, observation, async () => '', 'unit-media', 'unit-css-hash')).rejects.toThrow('文档已变化')
  expect(session.send).toHaveBeenLastCalledWith('Emulation.setEmulatedMedia', { media: '', features: [] })
  expect(session.detach).toHaveBeenCalledOnce()
})
