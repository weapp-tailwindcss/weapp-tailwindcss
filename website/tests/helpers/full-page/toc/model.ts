export interface TocHeading {
  id: string
  top: number
  bottom: number
}

export interface TocObservation {
  url: string
  viewportHeight: number
  hideOnScroll: boolean | null
  minHeadingLevel: number | null
  maxHeadingLevel: number | null
  navbarHeight: number | null
  links: { href: string, targetId: string | null, active: boolean }[]
  headings: TocHeading[]
  issues: string[]
}

export interface TocReadiness {
  ready: boolean
  reason: string
  expected: string | null
  expectedHeading: string | null
  actual: (string | null)[]
}

/** 对齐 Docusaurus 3 的视口上半区、navbar 边界与前一标题规则。 */
export function activeTocHeading(headings: TocHeading[], viewportHeight: number, offset: number) {
  const next = headings.findIndex(heading => heading.top >= offset)
  if (next === -1) {
    return headings.at(-1)?.id ?? null
  }
  const heading = headings[next]!
  return heading.top > 0 && heading.bottom < viewportHeight / 2
    ? heading.id
    : headings[next - 1]?.id ?? null
}

/** 未知结构必须等待；没有可见动态 TOC 时不干预页面。 */
export function evaluateTocReadiness(observation: TocObservation): TocReadiness {
  const actual = observation.links.filter(link => link.active).map(link => link.targetId)
  const waiting = (reason: string): TocReadiness => ({ ready: false, reason, expected: null, expectedHeading: null, actual })
  if (observation.issues.length) {
    return waiting(observation.issues.join('；'))
  }
  if (!observation.links.length) {
    return { ready: true, reason: '无可见动态 TOC', expected: null, expectedHeading: null, actual }
  }
  if (!Number.isFinite(observation.viewportHeight) || observation.viewportHeight <= 0
    || typeof observation.hideOnScroll !== 'boolean'
    || !Number.isInteger(observation.minHeadingLevel) || !Number.isInteger(observation.maxHeadingLevel)
    || observation.minHeadingLevel! < 1 || observation.maxHeadingLevel! > 6 || observation.minHeadingLevel! > observation.maxHeadingLevel!
    || (!observation.hideOnScroll && (observation.navbarHeight === null || !Number.isFinite(observation.navbarHeight) || observation.navbarHeight < 0))) {
    return waiting('TOC 缺少有效视口或 navbar 策略/几何')
  }
  const ids = observation.headings.map(heading => heading.id)
  if (!ids.length || new Set(ids).size !== ids.length
    || observation.headings.some(heading => !heading.id || !Number.isFinite(heading.top) || !Number.isFinite(heading.bottom) || heading.bottom <= heading.top)
    || observation.links.some(link => !link.targetId || !ids.includes(link.targetId))
    || new Set(observation.links.map(link => link.targetId)).size !== observation.links.length) {
    return waiting('TOC 链接、目标或标题几何不完整')
  }
  const expectedHeading = activeTocHeading(observation.headings, observation.viewportHeight, observation.hideOnScroll ? 0 : observation.navbarHeight!)
  const expected = observation.links.some(link => link.targetId === expectedHeading) ? expectedHeading : null
  const ready = expected === null ? actual.length === 0 : actual.length === 1 && actual[0] === expected
  return { ready, reason: ready ? 'TOC 高亮符合当前几何' : 'TOC 高亮尚未符合当前几何', expected, expectedHeading, actual }
}
