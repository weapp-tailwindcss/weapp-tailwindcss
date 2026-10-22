import type { Buffer } from 'node:buffer'
import type { BrowserContext, Page } from 'playwright'
import type { HistoryProfile, HistorySidecar, HistorySnapshot, HistoryState } from './types'
import { setTimeout as delay } from 'node:timers/promises'
import { waitForFrameProgress } from '../browser/frames'
import { assertionPassed } from '../report'
import { bounded } from '../web-native-media/deadline'
import { historyContract } from './contract'
import { historyElements, historyIdentity, historyObservation, historyPaths, historyScreenshot, historyToken } from './fixtures'
import { historySampleAssertions, historySnapshotValues } from './snapshot'

export async function historyPage(context: BrowserContext, raw: HistorySidecar) {
  const pages = context.pages()
  const page = pages[0] ?? await context.newPage()
  page.setDefaultTimeout(5_000)
  page.setDefaultNavigationTimeout(5_000)
  page.on('pageerror', error => raw.warnings.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      raw.warnings.push(message.text())
    }
  })
  await page.goto(raw.origin + historyPaths(raw.runId).fixture, { waitUntil: 'load' })
  return page
}

/** computed 与 matches 的隐私掩蔽只原样归档，颜色判定从 PNG 独立重算。 */
async function captureSnapshot(page: Page, name: HistoryState['name'], profile: HistoryProfile, raw: HistorySidecar, capture: (name: string, timeoutMs: number) => Promise<{ file: string, bytes: Buffer }>, next: () => number, attempt?: number, deadline = performance.now() + 5_000) {
  const token = historyToken(name, attempt)
  const timeOrigin = await page.evaluate((colors) => {
    document.querySelectorAll<HTMLElement>('#identity i').forEach((node, index) => {
      node.style.backgroundColor = `rgb(${colors[index]!.join(',')})`
    })
    return performance.timeOrigin
  }, historyIdentity(raw.runId, token, raw.generation!.cssHash, raw.engine, profile.id))
  const frames = await page.evaluate(waitForFrameProgress, { timeOrigin, timeoutMs: Math.max(1, deadline - performance.now()) })
  const observation = await page.evaluate(({ elements, frames, timeOrigin }) => {
    if (performance.timeOrigin !== timeOrigin) {
      throw new Error('历史采样的文档已变化')
    }
    return {
      id: document.body.dataset['fixture'] ?? '',
      runId: document.body.dataset['runId'] ?? '',
      url: location.href,
      origin: location.origin,
      topOrigin: window.top!.location.origin,
      frames,
      timeOrigin: performance.timeOrigin,
      links: Object.fromEntries(elements.map((id) => {
        const node = document.getElementById(id) as HTMLAnchorElement
        const style = getComputedStyle(node)
        const { left, top, width, height } = node.getBoundingClientRect()
        return [id, { href: node.href, computed: style.borderTopColor, matchesVisited: node.matches(':visited'), borderWidth: style.borderTopWidth, borderStyle: style.borderTopStyle, rect: { left, top, width, height } }]
      })),
    }
  }, { elements: historyElements, frames, timeOrigin })
  const state: HistorySnapshot = { ...observation, name, profile: profile.name, profileId: profile.id, screenshot: '', sequence: next() }
  const { file, bytes } = await capture(token, Math.max(1, deadline - performance.now()))
  state.screenshot = file
  return { state, bytes }
}

/** 返回导航不保证 visited 已绘制；只在同页固定预算内观察全部真实 PNG。 */
export async function captureHistory(page: Page, name: HistoryState['name'], profile: HistoryProfile, raw: HistorySidecar, capture: (name: string, timeoutMs: number) => Promise<{ file: string, bytes: Buffer }>, next: () => number) {
  if (name !== 'visited') {
    const { state } = await bounded('历史状态绘制与截图', () => captureSnapshot(page, name, profile, raw, capture, next))
    raw.states.push(state)
  }
  else {
    const started = performance.now()
    const trace: NonNullable<HistoryState['observation']> = { ...historyObservation, elapsedMs: 0, samples: [] }
    const expected = historyContract(raw.runId).expectedValues
    let final: HistoryState | undefined
    try {
      for (let attempt = 1; ; attempt++) {
        const startedMs = performance.now() - started
        const remaining = historyObservation.budgetMs - startedMs
        if (remaining <= 0) {
          throw new Error(`历史 visited 绘制未在 ${historyObservation.budgetMs}ms 内达成`)
        }
        let elapsedMs: number
        try {
          const { state, bytes } = await bounded('历史 visited 同页观察', () => captureSnapshot(page, name, profile, raw, capture, next, attempt, started + historyObservation.budgetMs), remaining)
          const previous = trace.samples.at(-1)
          const sample = { ...state, attempt, startedMs, elapsedMs: performance.now() - started }
          trace.samples.push(sample)
          if (final) {
            Object.assign(final, state)
          }
          else {
            final = { ...state, observation: trace }
            raw.states.push(final)
          }
          const values = historySnapshotValues(state, bytes, historyToken(name, attempt), raw.generation!.cssHash, raw.engine, raw.runId, raw.origin, profile.id)
          const sameDocument = !previous || (state.timeOrigin === previous.timeOrigin && state.frames[0]! > previous.frames[1]!)
          const invariant = sameDocument && historySampleAssertions(values, expected, true).every(assertionPassed)
          const ready = historySampleAssertions(values, expected).every(assertionPassed)
          elapsedMs = sample.elapsedMs = performance.now() - started
          if (elapsedMs > historyObservation.budgetMs) {
            throw new Error(`历史 visited 绘制超过 ${historyObservation.budgetMs}ms 总预算`)
          }
          if (!invariant || ready) {
            break
          }
        }
        catch (error) {
          raw.observationFailures.push({ attempt, startedMs, elapsedMs: performance.now() - started, screenshot: historyScreenshot(name, attempt), error: String(error) })
          throw error
        }
        const nextSample = elapsedMs + historyObservation.intervalMs
        while (performance.now() - started < Math.min(nextSample, historyObservation.budgetMs)) {
          await delay(Math.max(1, Math.min(nextSample, historyObservation.budgetMs) - (performance.now() - started)))
        }
      }
    }
    finally {
      trace.elapsedMs = performance.now() - started
    }
  }
  raw.lifecycle.push(`${name}:captured`)
}

/** 可信鼠标点击必须真的到达目标 HTTP 文档，再通过返回恢复夹具。 */
export async function visitHistory(page: Page, profile: HistoryProfile, raw: HistorySidecar, next: () => number) {
  const journal = `tailwind-history/${raw.runId}/${profile.id}`
  await page.evaluate(({ journal, runId, profileId }) => {
    sessionStorage.removeItem(journal)
    document.getElementById('probe')!.addEventListener('click', (event) => {
      sessionStorage.setItem(journal, JSON.stringify({ runId, profileId, trusted: event.isTrusted, mainFrame: window === window.top, href: (event.currentTarget as HTMLAnchorElement).href }))
    }, { once: true })
  }, { journal, runId: raw.runId, profileId: profile.id })
  const from = page.url()
  const [response] = await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.locator('#probe').click()])
  // 同源导航保留同步事件回执，避免跨文档异步 binding 被默认导航销毁。
  const click = await page.evaluate((journal) => {
    const value = sessionStorage.getItem(journal)
    sessionStorage.removeItem(journal)
    return value ? JSON.parse(value) as { runId: string, profileId: string, trusted: boolean, mainFrame: boolean, href: string } : null
  }, journal)
  const eventSequence = next()
  const identityMatches = click?.runId === raw.runId && click.profileId === profile.id
  raw.navigation.push({ action: 'click', profileId: profile.id, sequence: next(), eventSequence, from, to: page.url(), status: response?.status() ?? null, mainFrame: response?.frame() === page.mainFrame() && click?.mainFrame === true, trusted: identityMatches && click?.trusted === true, ...(click?.href ? { href: click.href } : {}) })
  raw.lifecycle.push('history:click')
  const target = page.url()
  const back = await page.goBack({ waitUntil: 'load' })
  raw.navigation.push({ action: 'back', profileId: profile.id, sequence: next(), from: target, to: page.url(), status: back?.status() ?? null, mainFrame: !back || back.frame() === page.mainFrame() })
  raw.lifecycle.push('history:back')
}
