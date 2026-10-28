import type { Page } from '@playwright/test'
import type { CaptureBudget } from './capture'
import { randomUUID } from 'node:crypto'
import { createCaptureBudget } from './capture'

export interface CaptureWindow {
  initialized: boolean
  completed: boolean
  frames: number
  events: number
  overflow: boolean
  disturbances: string[]
  geometry: { width: number, height: number }
  fingerprint: string
}

interface BrowserMonitor {
  settle: () => Promise<void>
  finish: () => CaptureWindow
  dispose: () => void
}

/** 结束时的正常状态不能抹去捕获期间已经发生的扰动或缺失证据。 */
export function validCaptureWindow(window: CaptureWindow | null | undefined) {
  return !!window && window.initialized && window.completed && window.frames >= 2
    && !window.overflow && window.disturbances.length === 0
    && typeof window.fingerprint === 'string' && window.fingerprint.length > 0
    && Number.isSafeInteger(window.geometry.width) && window.geometry.width > 0
    && Number.isSafeInteger(window.geometry.height) && window.geometry.height > 0
}

/** 观察 document 而不是 TOC 实例，防止整棵 TOC 卸载后观察器一起失效。 */
function installMonitor(key: string) {
  const symbol = Symbol.for(key)
  const activeClass = 'table-of-contents__link--active'
  const identities = new WeakMap<Element, number>()
  const tracked = new Set<Element>()
  let nextIdentity = 0
  let stopped = false
  let frame = 0
  const listeners = new AbortController()
  const disturbances = new Set<string>()
  const evidence: CaptureWindow = {
    initialized: false,
    completed: false,
    frames: 0,
    events: 0,
    overflow: false,
    disturbances: [],
    geometry: { width: 0, height: 0 },
    fingerprint: '',
  }
  const mark = (reason: string) => {
    if (++evidence.events > 200) {
      evidence.overflow = true
    }
    disturbances.add(reason)
  }
  const visible = (node: Element) => node.getClientRects().length > 0
    && getComputedStyle(node).visibility === 'visible' && getComputedStyle(node).display !== 'none'
  const identity = (node: Element) => {
    if (!identities.has(node)) {
      identities.set(node, ++nextIdentity)
      tracked.add(node)
    }
    return identities.get(node)!
  }
  const read = () => {
    const body = document.body
    const html = document.documentElement
    if (!body || !html) {
      throw new Error('捕获期观察器缺少 document 根节点')
    }
    const nodes = [...document.querySelectorAll('.toc-highlight')].filter(visible)
    const links = nodes.map((node) => {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      const running = node.getAnimations().some(animation => animation.playState === 'running' || animation.pending)
      if (running) {
        mark('TOC 捕获期间存在未完成动画')
      }
      return [identity(node), node.getAttribute('href'), node.classList.contains(activeClass), style.color, style.opacity, rect.x, rect.y, rect.width, rect.height]
    })
    const headings = nodes.length
      ? [...document.querySelectorAll('h1.anchor,h2.anchor,h3.anchor,h4.anchor,h5.anchor,h6.anchor')].map((node) => {
          let element = node
          let rect = element.getBoundingClientRect()
          while (rect.top === rect.bottom && element.parentElement) {
            element = element.parentElement
            rect = element.getBoundingClientRect()
          }
          return [identity(node), node.id, rect.top, rect.bottom]
        })
      : []
    const navbar = nodes.length ? document.querySelector<HTMLElement>('.navbar') : null
    return {
      viewport: [innerWidth, innerHeight, devicePixelRatio, scrollX, scrollY],
      geometry: {
        width: Math.max(body.scrollWidth, html.scrollWidth, body.offsetWidth, html.offsetWidth, body.clientWidth, html.clientWidth),
        height: Math.max(body.scrollHeight, html.scrollHeight, body.offsetHeight, html.offsetHeight, body.clientHeight, html.clientHeight),
      },
      url: location.href,
      links,
      headings,
      navbar: navbar ? [identity(navbar), navbar.clientHeight] : null,
    }
  }
  const initial = read()
  evidence.geometry = initial.geometry
  evidence.fingerprint = JSON.stringify(initial)
  const sample = () => {
    if (stopped) {
      return
    }
    try {
      const current = read()
      if (JSON.stringify(current.viewport) !== JSON.stringify(initial.viewport)) {
        mark(`捕获期间视口、DPR 或滚动位置改变：${JSON.stringify(current.viewport)}，初始 ${JSON.stringify(initial.viewport)}`)
      }
      if (JSON.stringify(current.geometry) !== JSON.stringify(initial.geometry)) {
        mark('捕获期间文档尺寸改变')
      }
      if (current.url !== initial.url) {
        mark('捕获期间 document URL 改变')
      }
      if (JSON.stringify(current.links) !== JSON.stringify(initial.links)) {
        mark('捕获期间 TOC 节点、高亮、实际颜色或几何改变')
      }
      if (JSON.stringify(current.headings) !== JSON.stringify(initial.headings)) {
        mark('捕获期间标题身份或几何改变')
      }
      if (JSON.stringify(current.navbar) !== JSON.stringify(initial.navbar)) {
        mark('捕获期间 navbar 身份或高亮几何改变')
      }
    }
    catch {
      mark('捕获期间只读观测失败')
    }
  }
  const hasToc = (node: Node) => node instanceof Element
    && (identities.has(node) || node.matches('.toc-highlight') || !!node.querySelector('.toc-highlight') || [...tracked].some(element => node.contains(element)))
  const mutations = (records: MutationRecord[]) => {
    for (const record of records) {
      if (record.type === 'childList' && ((record.target instanceof Element && identities.has(record.target)) || [...record.addedNodes, ...record.removedNodes].some(hasToc))) {
        mark('捕获期间 TOC 或标题节点被插入、移除或重新挂载')
      }
      if (record.type === 'characterData' && record.target.parentElement?.closest('.toc-highlight,.anchor')) {
        mark('捕获期间 TOC 或标题文本发生改变')
      }
      if (record.type === 'attributes' && record.target instanceof Element
        && (identities.has(record.target) || record.target.matches('.toc-highlight'))) {
        if (record.attributeName === 'class') {
          const oldActive = record.oldValue?.split(/\s+/).includes(activeClass) ?? false
          const active = record.target.classList.contains(activeClass)
          const baseline = initial.links.find(link => link[0] === identities.get(record.target))
          if (baseline && (oldActive !== active || oldActive !== baseline[2])) {
            mark('捕获期间 TOC active 属性发生改变')
          }
          if (record.oldValue !== record.target.getAttribute('class')) {
            mark('捕获期间 TOC 或标题 class 发生改变')
          }
        }
        else {
          mark('捕获期间 TOC 或标题属性发生改变')
        }
      }
    }
    sample()
  }
  const observer = new MutationObserver(mutations)
  const transition = (event: Event) => {
    if (event.target instanceof Element && (identities.has(event.target) || event.target.matches('.toc-highlight'))) {
      mark(`捕获期间 TOC ${event.type}`)
      sample()
    }
  }
  const tick = () => {
    evidence.frames += 1
    sample()
    frame = requestAnimationFrame(tick)
  }
  const dispose = () => {
    stopped = true
    observer.disconnect()
    listeners.abort()
    cancelAnimationFrame(frame)
    Reflect.deleteProperty(window, symbol)
  }
  const state: BrowserMonitor = {
    settle: () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    finish() {
      mutations(observer.takeRecords())
      evidence.completed = true
      evidence.disturbances = [...disturbances]
      dispose()
      return evidence
    },
    dispose,
  }
  Reflect.set(window, symbol, state)
  try {
    observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'href', 'id'] })
    for (const type of ['transitionrun', 'transitionstart', 'transitionend', 'transitioncancel', 'animationstart', 'animationcancel']) {
      document.addEventListener(type, transition, { capture: true, signal: listeners.signal })
    }
    for (const type of ['resize', 'scroll']) {
      window.addEventListener(type, sample, { capture: true, signal: listeners.signal })
    }
    frame = requestAnimationFrame(tick)
    evidence.initialized = true
  }
  catch (error) {
    dispose()
    throw error
  }
}

/** 清理预算只释放监听器，不进行超时后的额外采样。 */
export async function startCaptureMonitor(page: Page, budget: CaptureBudget) {
  const key = `weapp-full-page-monitor:${randomUUID()}`
  const close = () => createCaptureBudget(1000).run(() => page.evaluate((key) => {
    const state = Reflect.get(window, Symbol.for(key)) as BrowserMonitor | undefined
    state?.dispose()
  }, key))
  try {
    await budget.run(() => page.evaluate(installMonitor, key))
  }
  catch (error) {
    try {
      await close()
    }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], '捕获期观察器初始化或清理失败')
    }
    throw error
  }
  return {
    settle: () => budget.run(() => page.evaluate(async (key) => {
      const state = Reflect.get(window, Symbol.for(key)) as BrowserMonitor | undefined
      if (!state) {
        throw new Error('捕获期观察器状态丢失')
      }
      await state.settle()
    }, key)),
    finish: () => budget.run(() => page.evaluate((key) => {
      const state = Reflect.get(window, Symbol.for(key)) as BrowserMonitor | undefined
      if (!state) {
        throw new Error('捕获期观察器状态丢失')
      }
      return state.finish()
    }, key)),
    close,
  }
}
