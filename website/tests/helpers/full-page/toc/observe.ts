import type { Page } from '@playwright/test'
import type { TocObservation } from './model'

export interface TocOptions {
  hideOnScroll: boolean
  minHeadingLevel: number
  maxHeadingLevel: number
}

/** 只读当前 document；不滚动、不派发事件、不修改高亮或视口。 */
export function observeToc(page: Page, options: TocOptions | null): Promise<TocObservation> {
  return page.evaluate((options) => {
    const hideOnScroll = options?.hideOnScroll ?? null
    const minHeadingLevel = options?.minHeadingLevel ?? null
    const maxHeadingLevel = options?.maxHeadingLevel ?? null
    const issues: string[] = []
    const visible = (element: Element) => element.getClientRects().length > 0
      && getComputedStyle(element).visibility === 'visible'
      && getComputedStyle(element).display !== 'none'
    const nodes = [...document.querySelectorAll('.toc-highlight')].filter(visible)
    if (nodes.length && !options) {
      issues.push('可见动态 TOC 缺少准确构建的 navbar/heading 配置或路由 metadata')
    }
    const targetsById = new Map<string, HTMLElement[]>()
    for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
      targetsById.set(element.id, [...targetsById.get(element.id) ?? [], element])
    }
    const pageUrl = new URL(location.href)
    const links = nodes.map((node) => {
      const active = node.classList.contains('table-of-contents__link--active')
      const href = node.getAttribute('href') ?? ''
      const link = { href, targetId: null as string | null, active }
      if (!(node instanceof HTMLAnchorElement) || !node.classList.contains('table-of-contents__link')) {
        issues.push(`未知动态 TOC 节点：${node.tagName}`)
        return link
      }
      try {
        const url = new URL(node.href, pageUrl)
        if (url.origin !== pageUrl.origin || url.pathname !== pageUrl.pathname || url.search !== pageUrl.search || !url.hash) {
          issues.push(`TOC 不是当前页面的 hash 链接：${href}`)
          return link
        }
        link.targetId = decodeURIComponent(url.hash.slice(1))
        const matching = targetsById.get(link.targetId) ?? []
        const target = matching[0]
        if (matching.length !== 1 || !target || !/^H[1-6]$/.test(target.tagName) || !target.classList.contains('anchor')) {
          issues.push(`TOC 目标缺失、重复或不是 Docusaurus 标题：${link.targetId}`)
        }
        else if (minHeadingLevel === null || maxHeadingLevel === null
          || Number(target.tagName.slice(1)) < minHeadingLevel || Number(target.tagName.slice(1)) > maxHeadingLevel) {
          issues.push(`TOC 目标不在构建声明的 heading 范围内：${link.targetId}`)
        }
      }
      catch {
        issues.push(`TOC hash 无法解析：${href}`)
      }
      return link
    })
    const selectors = options && Number.isInteger(minHeadingLevel) && Number.isInteger(maxHeadingLevel)
      && minHeadingLevel! >= 1 && maxHeadingLevel! <= 6 && minHeadingLevel! <= maxHeadingLevel!
      ? Array.from({ length: maxHeadingLevel! - minHeadingLevel! + 1 }, (_, index) => `h${minHeadingLevel! + index}.anchor`).join(',')
      : null
    const headings = (nodes.length && selectors ? [...document.querySelectorAll<HTMLElement>(selectors)] : [])
      .map((target) => {
        let element: HTMLElement | null = target
        let rect = element.getBoundingClientRect()
        // 与上游相同：零高 anchor 读取最近的非零高父节点。
        while (rect.top === rect.bottom && element.parentElement) {
          element = element.parentElement
          rect = element.getBoundingClientRect()
        }
        return { id: target.id, top: rect.top, bottom: rect.bottom }
      })
    const navbar = document.querySelector<HTMLElement>('.navbar')
    return { url: location.href, viewportHeight: innerHeight, hideOnScroll, minHeadingLevel, maxHeadingLevel, navbarHeight: navbar?.clientHeight ?? null, links, headings, issues }
  }, options)
}
