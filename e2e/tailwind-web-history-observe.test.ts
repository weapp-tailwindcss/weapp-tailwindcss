import type { Buffer } from 'node:buffer'
import type { Page } from 'playwright'
import { PNG } from 'pngjs'
import { expect, it, vi } from 'vitest'
import { historyIdentity, historyProbe } from './tailwind-capabilities/web-history/fixtures'
import { captureHistory } from './tailwind-capabilities/web-history/observe'
import { syntheticHistory } from './tailwind-capabilities/web-history/test-fixture'

function observation(mode: 'delayed' | 'never' | 'reference-only' | 'control' | 'error') {
  const fixture = syntheticHistory()
  const state = fixture.raw.states[1]!
  fixture.raw.states = []
  fixture.raw.lifecycle = []
  let colors: number[][] = []
  let calls = 0
  const page = { evaluate: vi.fn(async (_fn, input) => {
    colors = input.colors
    const { id, runId, url, origin, topOrigin, links, timeOrigin } = state
    return { id, runId, url, origin, topOrigin, links, timeOrigin, frames: [calls * 2 + 1, calls * 2 + 2] }
  }) } as unknown as Page
  const screenshots = new Map<string, Buffer>()
  const capture = vi.fn(async (token: string) => {
    calls++
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
  expect(f.page.evaluate).toHaveBeenCalledTimes(2)
  expect(historyIdentity(f.fixture.runId, 'visited-observation-1', f.fixture.cssHash, f.fixture.engine, f.fixture.raw.profiles[0]!.id))
    .not
    .toEqual(historyIdentity(f.fixture.runId, 'visited-observation-2', f.fixture.cssHash, f.fixture.engine, f.fixture.raw.profiles[0]!.id))
})

it.each(['never', 'reference-only'] as const)('%s不能凭节点、computed或参考链接单独达成而停止观察', async (mode) => {
  const f = observation(mode)
  await expect(f.run()).rejects.toThrow(/预算|达成/)
  const trace = f.fixture.raw.states[0]!.observation!
  expect(trace.samples.length).toBeGreaterThan(1)
  expect(trace.samples.at(-1)!.elapsedMs).toBeLessThanOrEqual(2_000)
  expect(trace.elapsedMs).toBeGreaterThanOrEqual(2_000)
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
