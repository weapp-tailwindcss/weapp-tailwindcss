import { parseCssSource } from '@weapp-tailwindcss/postcss/syntax'

const UNI_APP_X_WEB_COMPONENT_TAGS = [
  'uni-ad-draw',
  'uni-ad-fullscreen-video',
  'uni-ad-interactive',
  'uni-ad-interstitial',
  'uni-ad-rewarded-video',
  'uni-ad',
  'uni-animation-view',
  'uni-audio',
  'uni-block',
  'uni-button',
  'uni-camera',
  'uni-canvas',
  'uni-checkbox-group',
  'uni-checkbox',
  'uni-cover-image',
  'uni-cover-view',
  'uni-custom-tab-bar',
  'uni-editor',
  'uni-form',
  'uni-icon',
  'uni-image',
  'uni-input',
  'uni-label',
  'uni-list-item',
  'uni-list-view',
  'uni-live-player',
  'uni-live-pusher',
  'uni-map',
  'uni-match-media',
  'uni-movable-area',
  'uni-movable-view',
  'uni-navigation-bar',
  'uni-navigator',
  'uni-open-data',
  'uni-page-meta',
  'uni-picker-view',
  'uni-picker',
  'uni-progress',
  'uni-radio-group',
  'uni-radio',
  'uni-rich-text',
  'uni-scroll-view',
  'uni-slider',
  'uni-sticky-header',
  'uni-sticky-section',
  'uni-swiper-item',
  'uni-swiper',
  'uni-switch',
  'uni-template',
  'uni-text',
  'uni-textarea',
  'uni-unicloud-db',
  'uni-video',
  'uni-view',
  'uni-web-view',
] as const

export const UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER = 'weapp-tailwindcss uni-app-x web preflight reset'

export const UNI_APP_X_WEB_PREFLIGHT_RESET_CSS = [
  `/* ${UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER} */`,
  `${UNI_APP_X_WEB_COMPONENT_TAGS.map(tag => `uni-app ${tag}`).join(', ')}{border-width:0;}`,
].join('\n')

const TAILWIND_PREFLIGHT_BORDER_RE = /\bborder\s*:\s*0(?:px)?\s+solid\b/
const UNI_APP_X_WEB_FRAMEWORK_BORDER_RE = new RegExp(
  `\\buni-app\\s+(?:${UNI_APP_X_WEB_COMPONENT_TAGS.join('|')})[^{}]*\\{[^{}]*\\bborder-width\\s*:\\s*medium\\b[^{}]*\\}`,
  'g',
)

function findUniAppXWebFrameworkBorderEnd(css: string) {
  const matcher = new RegExp(UNI_APP_X_WEB_FRAMEWORK_BORDER_RE.source, 'g')
  let lastEnd = -1
  for (;;) {
    const match = matcher.exec(css)
    if (match === null) {
      break
    }
    lastEnd = matcher.lastIndex
  }
  return lastEnd
}

const RESET_SELECTORS = new Set(UNI_APP_X_WEB_COMPONENT_TAGS.map(tag => `uni-app ${tag}`))

interface InjectedResetRange {
  start: number
  end: number
  complete: boolean
}

function findInjectedResetRanges(css: string): InjectedResetRange[] {
  if (!css.includes(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER) && !css.includes('uni-app uni-ad-draw')) {
    return []
  }
  // 只读取已注入规则的身份与位置，CSS 解析交给共享 PostCSS 包。
  const root = parseCssSource(css)
  const ranges: InjectedResetRange[] = []
  root.each((node) => {
    if (node.type === 'comment' && node.text.trim() === UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER) {
      ranges.push({ start: node.source!.start!.offset, end: node.source!.end!.offset, complete: false })
      return
    }
    if (node.type !== 'rule' || node.nodes.length !== 1) {
      return
    }
    const declaration = node.nodes[0]!
    if (declaration.type !== 'decl' || declaration.prop !== 'border-width'
      || !/^0(?:px)?$/.test(declaration.value) || declaration.important) {
      return
    }
    const selectors = new Set(node.selectors.map(selector => selector.trim().replace(/\s+/g, ' ')))
    if (selectors.size !== RESET_SELECTORS.size || [...selectors].some(selector => !RESET_SELECTORS.has(selector))) {
      return
    }
    const previous = node.prev()
    const marker = previous?.type === 'comment' && previous.text.trim() === UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER
      ? ranges.pop()
      : undefined
    ranges.push({
      start: marker?.start ?? node.source!.start!.offset,
      end: node.source!.end!.offset,
      complete: true,
    })
  })
  return ranges
}

function removeInjectedResets(css: string, ranges: InjectedResetRange[]) {
  let source = css
  for (const range of [...ranges].reverse()) {
    source = source.slice(0, range.start) + source.slice(range.end)
  }
  return source
}

export function withUniAppXWebPreflightReset(css: string, enabled: boolean) {
  if (!enabled) {
    return css
  }

  const frameworkBorderEnd = findUniAppXWebFrameworkBorderEnd(css)
  const hasTailwindPreflightBorder = TAILWIND_PREFLIGHT_BORDER_RE.test(css)
  const injectedResets = findInjectedResetRanges(css)
  if (frameworkBorderEnd >= 0) {
    if (injectedResets.length === 1 && injectedResets[0]!.complete && injectedResets[0]!.start >= frameworkBorderEnd) {
      return css
    }
    const source = removeInjectedResets(css, injectedResets)
    const resetAfterFrameworkBorder = findUniAppXWebFrameworkBorderEnd(source)
    if (resetAfterFrameworkBorder < 0) {
      return source
    }
    return `${source.slice(0, resetAfterFrameworkBorder)}\n${UNI_APP_X_WEB_PREFLIGHT_RESET_CSS}${source.slice(resetAfterFrameworkBorder)}`
  }
  if (injectedResets.length > 1) {
    return `${UNI_APP_X_WEB_PREFLIGHT_RESET_CSS}\n${removeInjectedResets(css, injectedResets)}`
  }
  if (injectedResets.length > 0 || !hasTailwindPreflightBorder) {
    return css
  }
  return css.length > 0
    ? `${UNI_APP_X_WEB_PREFLIGHT_RESET_CSS}\n${css}`
    : UNI_APP_X_WEB_PREFLIGHT_RESET_CSS
}
