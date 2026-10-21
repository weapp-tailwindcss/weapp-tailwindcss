import type { BrowserContext, Page } from 'playwright'
import type { HistoryProfile, HistorySidecar, HistoryState } from './types'
import { bounded } from '../web-native-media/deadline'
import { historyElements, historyIdentity, historyPaths } from './fixtures'

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
export async function captureHistory(page: Page, name: HistoryState['name'], profile: HistoryProfile, raw: HistorySidecar, capture: (name: string) => Promise<string>, next: () => number) {
  const observation = await bounded('历史状态绘制观察', () => page.evaluate(async ({ elements, colors }) => {
    document.querySelectorAll<HTMLElement>('#identity i').forEach((node, index) => {
      node.style.backgroundColor = `rgb(${colors[index]!.join(',')})`
    })
    const frames: number[] = []
    for (let i = 0; i < 2; i++) {
      frames.push(await new Promise<number>(resolve => requestAnimationFrame(resolve)))
    }
    return {
      id: document.body.dataset['fixture'] ?? '',
      runId: document.body.dataset['runId'] ?? '',
      url: location.href,
      origin: location.origin,
      topOrigin: window.top!.location.origin,
      frames,
      links: Object.fromEntries(elements.map((id) => {
        const node = document.getElementById(id) as HTMLAnchorElement
        const style = getComputedStyle(node)
        const { left, top, width, height } = node.getBoundingClientRect()
        return [id, { href: node.href, computed: style.borderTopColor, matchesVisited: node.matches(':visited'), borderWidth: style.borderTopWidth, borderStyle: style.borderTopStyle, rect: { left, top, width, height } }]
      })),
    }
  }, { elements: historyElements, colors: historyIdentity(raw.runId, name, raw.generation!.cssHash, raw.engine) }))
  const state: HistoryState = { name, profile: profile.name, profileId: profile.id, ...observation, screenshot: '', sequence: next() }
  raw.states.push(state)
  state.screenshot = await bounded('历史状态截图', () => capture(name))
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
