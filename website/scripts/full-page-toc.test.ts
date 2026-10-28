import type { Page } from '@playwright/test'
import type { CaptureBudget } from '../tests/helpers/full-page/capture'
import type { TocObservation } from '../tests/helpers/full-page/toc/model'
import { expect, it } from 'vitest'
import { activeTocHeading, evaluateTocReadiness } from '../tests/helpers/full-page/toc/model'
import { TocReadinessError, waitForTocReadiness } from '../tests/helpers/full-page/toc/readiness'

const options = { hideOnScroll: false, minHeadingLevel: 2, maxHeadingLevel: 3 }
const heading = (id: string, top: number, bottom = top + 30) => ({ id, top, bottom })
function observation(overrides: Partial<TocObservation> = {}): TocObservation {
  return {
    url: 'https://toc.fixture/doc',
    viewportHeight: 720,
    ...options,
    navbarHeight: 63,
    links: [{ href: '#first', targetId: 'first', active: true }, { href: '#second', targetId: 'second', active: false }],
    headings: [heading('first', 267), heading('second', 600)],
    issues: [],
    ...overrides,
  }
}

it.each([
  ['上半屏标题', [heading('first', 267), heading('second', 600)], 63, 'first'],
  ['首标题在下半屏', [heading('first', 500)], 63, null],
  ['下一标题在下半屏', [heading('first', -100), heading('second', 500)], 63, 'first'],
  ['下一标题进入上半屏', [heading('first', -100), heading('second', 200)], 63, 'second'],
  ['标题压住navbar', [heading('first', 20), heading('second', 500)], 63, 'first'],
  ['所有标题超过上边界', [heading('first', -100), heading('second', -20)], 63, 'second'],
  ['零top不属于上半屏', [heading('first', 0)], 0, null],
  ['严格半屏边界', [heading('first', 330, 360)], 63, null],
] as const)('%s沿用上游active判定', (_label, headings, offset, expected) => {
  expect(activeTocHeading([...headings], 720, offset)).toBe(expected)
})

it('允许正确无active，拒绝旧active及多个active', () => {
  expect(evaluateTocReadiness(observation()).ready).toBe(true)
  const bottom = observation({ headings: [heading('first', 500), heading('second', 700)] })
  expect(evaluateTocReadiness(bottom).ready).toBe(false)
  bottom.links[0]!.active = false
  expect(evaluateTocReadiness(bottom)).toMatchObject({ ready: true, expected: null })
  const duplicate = observation()
  duplicate.links[1]!.active = true
  expect(evaluateTocReadiness(duplicate).ready).toBe(false)
})

it('未链接的范围内标题成为active时，真实TOC应该没有active', () => {
  const value = observation({ headings: [heading('first', -100), heading('unlinked', 200), heading('second', 600)] })
  expect(evaluateTocReadiness(value)).toMatchObject({ ready: false, expected: null, expectedHeading: 'unlinked' })
  value.links[0]!.active = false
  expect(evaluateTocReadiness(value)).toMatchObject({ ready: true, expected: null, expectedHeading: 'unlinked' })
})

it('hideOnScroll使用零边界而非navbar高度', () => {
  const value = observation({ headings: [heading('first', 20), heading('second', 200)] })
  expect(evaluateTocReadiness(value).expected).toBe('second')
  expect(evaluateTocReadiness({ ...value, hideOnScroll: true, navbarHeight: null }).expected).toBe('first')
})

it.each([
  { issues: ['missing target'] },
  { viewportHeight: 0 },
  { navbarHeight: null },
  { minHeadingLevel: null },
  { maxHeadingLevel: 7 },
  { hideOnScroll: null },
  { headings: [] },
  { headings: [heading('first', Number.NaN)] },
  { headings: [heading('first', 0, 0)] },
  { headings: [heading('first', 20), heading('first', 200)] },
  { links: [{ href: '#missing', targetId: null, active: false }] },
  { links: [{ href: '#first', targetId: 'first', active: false }, { href: '#first', targetId: 'first', active: false }] },
])('未知或不完整观测不得误过：%j', (overrides) => {
  expect(evaluateTocReadiness(observation(overrides)).ready).toBe(false)
})

it('无可见动态TOC不要求metadata或navbar', () => {
  expect(evaluateTocReadiness(observation({ links: [], headings: [], hideOnScroll: null, minHeadingLevel: null, maxHeadingLevel: null, navbarHeight: null })).ready).toBe(true)
})

it('同一个预算覆盖前置工作和全部观测，耗尽后保留最后观测且不再读DOM', async () => {
  const exhausted = new Error('原共享预算耗尽')
  let operations = 0
  let reads = 0
  const budget: CaptureBudget = {
    remaining: () => 1,
    async run(operation) {
      if (++operations > 4) {
        throw exhausted
      }
      return operation(1)
    },
  }
  await budget.run(async () => undefined)
  const last = observation({ issues: ['target missing'] })
  const page = { evaluate: async (_fn: unknown, argument: unknown) => argument ? (++reads, last) : undefined } as unknown as Page
  let error: TocReadinessError | undefined
  try {
    await waitForTocReadiness(page, budget, options)
  }
  catch (failure) {
    error = failure as TocReadinessError
  }
  expect(error).toBeInstanceOf(TocReadinessError)
  expect(error!.cause).toBe(exhausted)
  expect(error!.evidence.observation).toBe(last)
  expect(error!.evidence.readiness?.ready).toBe(false)
  expect(reads).toBe(2)
  expect(operations).toBe(5)
})

it('初始化正常修正高亮后直接通过，不主动派发事件', async () => {
  let reads = 0
  const page = { evaluate: async (_fn: unknown, argument: unknown) => argument ? observation({ issues: ++reads === 1 ? ['pending effect'] : [] }) : undefined } as unknown as Page
  const budget: CaptureBudget = { remaining: () => 100, run: operation => operation(100) }
  await waitForTocReadiness(page, budget, options)
  expect(reads).toBe(2)
})
