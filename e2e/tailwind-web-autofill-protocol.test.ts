import type { Page } from 'playwright'
import type { AutofillEvent, AutofillObservation } from './tailwind-capabilities/web-autofill/types'
import { afterEach, expect, it, vi } from 'vitest'
import { observeAutofill } from './tailwind-capabilities/web-autofill/native'
import { syntheticAutofill } from './tailwind-capabilities/web-autofill/test-fixture'

afterEach(() => vi.useRealTimers())

function setup(mode: 'normal' | 'enable-failed' | 'trigger-failed' | 'event-timeout' | 'raf-timeout' | 'cleanup-failed') {
  const fixture = syntheticAutofill()
  const observation: AutofillObservation = { timeline: [], commands: [], events: [], states: [], cleanup: { errors: [], detached: false } }
  let listener: ((event: AutofillEvent) => void) | undefined
  let node = 9
  let state = 0
  const session = {
    on: vi.fn((_event, callback) => { listener = callback }),
    off: vi.fn(),
    detach: mode === 'cleanup-failed' ? vi.fn().mockRejectedValue(new Error('detach failed')) : vi.fn().mockResolvedValue(undefined),
    send: vi.fn(async (method) => {
      if (method === 'Autofill.enable' && mode === 'enable-failed') {
        throw new Error('enable failed')
      }
      if (method === 'Autofill.trigger') {
        if (mode === 'trigger-failed') {
          throw new Error('trigger failed')
        }
        if (mode !== 'event-timeout') {
          listener!(fixture.observation.events[0]!)
        }
      }
      if (method === 'Autofill.disable' && mode === 'cleanup-failed') {
        throw new Error('disable failed')
      }
      if (method === 'DOM.getDocument') {
        return { root: { nodeId: 1 } }
      }
      if (method === 'Page.getFrameTree') {
        return { frameTree: { frame: { id: 'unit-frame' } } }
      }
      if (method === 'DOM.querySelector') {
        return { nodeId: ++node }
      }
      if (method === 'DOM.describeNode') {
        return { node: { backendNodeId: node } }
      }
      return {}
    }),
  }
  const locator = { click: vi.fn().mockResolvedValue(undefined), press: vi.fn().mockResolvedValue(undefined), pressSequentially: vi.fn().mockResolvedValue(undefined) }
  const page = { context: () => ({ newCDPSession: async () => session }), locator: () => locator, waitForFunction: vi.fn().mockResolvedValue(undefined), evaluate: mode === 'raf-timeout' ? vi.fn(() => new Promise(() => {})) : vi.fn(async () => structuredClone(fixture.observation.states[state++]!)) } as unknown as Page
  const run = () => observeAutofill(page, observation, async name => `autofill-native-outline-${name}.png`, fixture.runId, fixture.cssHash)
  return { run, session, observation }
}

it('事件先于 filled 采样且全部结束后禁用并释放原生连接', async () => {
  const { run, session, observation } = setup('normal')
  await run()
  expect(observation.timeline).toEqual(['enable', 'state/initial', 'trigger', 'native-event/0', 'state/filled', 'state/restored', 'disable'])
  expect(session.off).toHaveBeenCalledOnce()
  expect(session.detach).toHaveBeenCalledOnce()
})

it.each(['enable-failed', 'trigger-failed', 'cleanup-failed'] as const)('%s 保留原始异常，同时尝试 disable 与 detach', async (mode) => {
  const { run, session, observation } = setup(mode)
  await expect(run()).rejects.toThrow(mode === 'cleanup-failed' ? 'disable failed' : mode.replace('-failed', ' failed'))
  expect(session.send.mock.calls.some(([method]) => method === 'Autofill.disable')).toBe(true)
  expect(session.detach).toHaveBeenCalledOnce()
  if (mode === 'cleanup-failed') {
    expect(observation.cleanup.errors).toHaveLength(2)
  }
})

it.each(['event-timeout', 'raf-timeout'] as const)('%s 在有限预算后进入清理，不能无限挂起', async (mode) => {
  vi.useFakeTimers()
  const { run, session } = setup(mode)
  const rejected = expect(run()).rejects.toThrow('预算')
  await vi.advanceTimersByTimeAsync(5_001)
  await rejected
  expect(session.off).toHaveBeenCalledOnce()
  expect(session.detach).toHaveBeenCalledOnce()
})
