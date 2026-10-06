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

function removeInjectedUniAppXWebPreflightReset(css: string) {
  const injectedReset = css.includes(UNI_APP_X_WEB_PREFLIGHT_RESET_CSS)
    ? UNI_APP_X_WEB_PREFLIGHT_RESET_CSS
    : `/* ${UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER} */`
  const resetIndex = css.indexOf(injectedReset)
  if (resetIndex < 0) {
    return css
  }
  const before = css.slice(0, resetIndex).trimEnd()
  const after = css.slice(resetIndex + injectedReset.length).trimStart()
  if (!before) {
    return after
  }
  if (!after) {
    return before
  }
  return `${before}\n${after}`
}

export function withUniAppXWebPreflightReset(css: string, enabled: boolean) {
  if (!enabled) {
    return css
  }

  const frameworkBorderEnd = findUniAppXWebFrameworkBorderEnd(css)
  const hasTailwindPreflightBorder = TAILWIND_PREFLIGHT_BORDER_RE.test(css)
  const hasInjectedReset = css.includes(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER)
  if (frameworkBorderEnd >= 0) {
    const source = hasInjectedReset ? removeInjectedUniAppXWebPreflightReset(css) : css
    const resetAfterFrameworkBorder = findUniAppXWebFrameworkBorderEnd(source)
    if (resetAfterFrameworkBorder < 0) {
      return source
    }
    return `${source.slice(0, resetAfterFrameworkBorder)}\n${UNI_APP_X_WEB_PREFLIGHT_RESET_CSS}${source.slice(resetAfterFrameworkBorder)}`
  }
  if (hasInjectedReset || !hasTailwindPreflightBorder) {
    return css
  }
  return css.length > 0
    ? `${UNI_APP_X_WEB_PREFLIGHT_RESET_CSS}\n${css}`
    : UNI_APP_X_WEB_PREFLIGHT_RESET_CSS
}
