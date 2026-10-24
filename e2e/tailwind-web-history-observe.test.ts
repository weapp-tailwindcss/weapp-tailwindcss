import type { Buffer } from 'node:buffer'
import type { Page } from 'playwright'
import { runInNewContext } from 'node:vm'
import { PNG } from 'pngjs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { waitForFrameProgress } from './tailwind-capabilities/browser/frames'
import { historyAssertions } from './tailwind-capabilities/web-history/contract'
import { historyIdentity, historyProbe } from './tailwind-capabilities/web-history/fixtures'
import { captureHistory } from './tailwind-capabilities/web-history/observe'
import { syntheticHistory } from './tailwind-capabilities/web-history/test-fixture'

const clock = vi.hoisted(() => ({ now: 0 }))
vi.mock('node:timers/promises', () => ({
  setTimeout: async (delay: number) => {
    clock.now += delay
  },
}))
beforeEach(() => {
  clock.now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock.now)
})
afterEach(() => vi.restoreAllMocks())

function observation(mode: 'delayed' | 'never' | 'reference-only' | 'control' | 'error' | 'navigation', onCapture?: (attempt: number) => void) {
  const fixture = syntheticHistory()
  const state = fixture.raw.states[1]!
  fixture.raw.states = []
  fixture.raw.lifecycle = []
  let colors: number[][] = []
  let calls = 0
  const page = { evaluate: vi.fn(async (_fn, input) => {
    if (Array.isArray(input)) {
      colors = input
      return state.timeOrigin
    }
    if (_fn === waitForFrameProgress) {
      return [calls * 2 + 1, calls * 2 + 2]
    }
    if (mode === 'navigation') {
      return runInNewContext(`(${String(_fn)})(input)`, { input, performance: { timeOrigin: state.timeOrigin + 1 } })
    }
    const { id, runId, url, origin, topOrigin, links, timeOrigin } = state
    return { id, runId, url, origin, topOrigin, links, timeOrigin, frames: input.frames }
  }) } as unknown as Page
  const screenshots = new Map<string, Buffer>()
  const capture = vi.fn(async (token: string) => {
    calls++
    onCapture?.(calls)
    if (mode === 'error') {
      throw new Error('original screenshot error')
    }
    const png = PNG.sync.read(fixture.screenshots.get(state.screenshot)!)
    const reached = mode === 'delayed' && calls > 1
    for (const [id, link] of Object.entries(state.links)) {
      const rgba = id === 'control'
        ? mode === 'control' ? [18, 52, 86, 255] : [1, 2, 3, 255]
        : reached || (mode === 'reference-only' && id === 'reference') ? [18, 52, 86, 255] : [1, 2, 3, 255]
      const r = link.rect
      for (let y = r.top; y < r.top + r.height; y++) {
        for (let x = r.left; x < r.left + r.width; x++) {
          png.data.set(rgba, (y * png.width + x) * 4)
        }
      }
    }
    colors.forEach((color, i) => png.data.set([...color, 255], (162 * png.width + 24 + i * 4 + 2) * 4))
    const file = `${historyProbe.id}-${token}.png`
    const bytes = PNG.sync.write(png)
    screenshots.set(file, bytes)
    return { file, bytes }
  })
  let sequence = 10
  const run = () => captureHistory(page, 'visited', fixture.raw.profiles[0]!, fixture.raw, capture, () => ++sequence)
  return { fixture, page, screenshots, capture, run }
}

it('首张仍为旧色时在同页有界观察，保留每次独立PNG和身份', async () => {
  const f = observation('delayed')
  await f.run()
  const state = f.fixture.raw.states[0]!
  expect(f.capture).toHaveBeenCalledTimes(2)
  expect(state.observation?.samples).toHaveLength(2)
  expect(state.observation?.budgetMs).toBe(2_000)
  expect(state.screenshot).toBe(`${historyProbe.id}-visited-observation-2.png`)
  expect([...f.screenshots.keys()]).toEqual([1, 2].map(i => `${historyProbe.id}-visited-observation-${i}.png`))
  expect(vi.mocked(f.page.evaluate).mock.calls.filter(([callback]) => callback === waitForFrameProgress)).toHaveLength(2)
  expect(historyIdentity(f.fixture.runId, 'visited-observation-1', f.fixture.cssHash, f.fixture.engine, f.fixture.raw.profiles[0]!.id))
    .not
    .toEqual(historyIdentity(f.fixture.runId, 'visited-observation-2', f.fixture.cssHash, f.fixture.engine, f.fixture.raw.profiles[0]!.id))
})

it.each(['never', 'reference-only'] as const)('%s不能凭节点、computed或参考链接单独达成而停止观察', async (mode) => {
  const f = observation(mode)
  await expect(f.run()).rejects.toThrow(/预算|达成/)
  const trace = f.fixture.raw.states[0]!.observation!
  expect(trace.samples).toHaveLength(20)
  expect(trace.samples.map(sample => sample.startedMs)).toEqual(Array.from({ length: 20 }, (_, i) => i * 100))
  expect(trace.samples.at(-1)!.elapsedMs).toBe(1_900)
  expect(trace.elapsedMs).toBe(2_000)
  expect(f.capture).toHaveBeenCalledTimes(20)
  expect(f.fixture.raw.lifecycle).not.toContain('visited:captured')
})

it('迟到的达成样本保留PNG和首败，但不能超过预算后通过', async () => {
  const f = observation('delayed', (attempt) => {
    if (attempt === 2) {
      clock.now = 2_000.8575
    }
  })
  await expect(f.run()).rejects.toThrow('超过 2000ms 总预算')
  const state = f.fixture.raw.states[0]!
  const trace = state.observation!
  expect(trace.samples).toHaveLength(2)
  expect(trace.samples.at(-1)).toMatchObject({ attempt: 2, startedMs: 100, elapsedMs: 2_000.8575, screenshot: `${historyProbe.id}-visited-observation-2.png` })
  expect(trace.elapsedMs).toBe(2_000.8575)
  expect(f.screenshots.has(state.screenshot)).toBe(true)
  expect(f.fixture.raw.observationFailures).toEqual([expect.objectContaining({ attempt: 2, elapsedMs: 2_000.8575, screenshot: state.screenshot, error: 'Error: 历史 visited 绘制超过 2000ms 总预算' })])
  expect(f.fixture.raw.lifecycle).not.toContain('visited:captured')
  const { raw, cssHash, engine, runId } = f.fixture
  const assertions = historyAssertions(raw, f.screenshots, cssHash, engine, runId)
  expect(assertions.find(item => item.name === 'visited/probe/pixel/top/red')).toMatchObject({ actual: 18, expected: 18 })
  expect(assertions.find(item => item.name === 'visited/observation/policy')).toMatchObject({ actual: false, expected: true })
  expect(assertions.find(item => item.name === 'visited/observation/no-errors')).toMatchObject({ actual: false, expected: true })
})

it('未访问control被污染时立即保留失败，不等待后续样本覆盖', async () => {
  const f = observation('control')
  await f.run()
  expect(f.capture).toHaveBeenCalledTimes(1)
  expect(f.fixture.raw.states[0]!.observation?.samples).toHaveLength(1)
})

it('截图异常原样失败，不能冒充等待期望状态超时', async () => {
  const f = observation('error')
  await expect(f.run()).rejects.toThrow('original screenshot error')
  expect(f.capture).toHaveBeenCalledTimes(1)
  expect(f.fixture.raw.observationFailures).toEqual([expect.objectContaining({ attempt: 1, screenshot: `${historyProbe.id}-visited-observation-1.png`, error: 'Error: original screenshot error' })])
})

it('帧与样式阶段之间的文档变化立即失败，禁止截图拼接', async () => {
  const f = observation('navigation')
  await expect(f.run()).rejects.toThrow('文档已变化')
  expect(f.capture).not.toHaveBeenCalled()
  expect(f.fixture.raw.observationFailures).toEqual([expect.objectContaining({ attempt: 1, error: 'Error: 历史采样的文档已变化' })])
})
