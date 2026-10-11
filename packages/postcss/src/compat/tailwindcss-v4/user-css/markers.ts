import type postcss from 'postcss'

export const TAILWIND_V4_BANNER_RE = /\/\*!\s*tailwindcss v4\./
export const TAILWIND_GENERATED_CSS_MARKER_RE = /\/\*!\s*tailwindcss v|@property\s+--tw-|--tw-|:not\(#\\#\)|\.[^,{]*(?:\\:|\\\[|\\#)|(?::root\s*,\s*:host|:host\s*,\s*page\s*,\s*\.tw-root\s*,\s*wx-root-portal-content)[^{]*\{[^}]*(?:--spacing\b|--(?:color|text|font|default|radius)-)/
const TAILWIND_ESCAPED_UTILITY_MARKER_RE = /\.[^,{]{0,512}(?:\\:|\\\[|\\#)/
const TAILWIND_ROOT_THEME_MARKER_RE = /(?::root\s*,\s*:host|:host\s*,\s*page\s*,\s*\.tw-root\s*,\s*wx-root-portal-content)[^{]{0,256}\{[^}]{0,4096}(?:--spacing\b|--(?:color|text|font|default|radius)-)/
export const GENERATOR_PLACEHOLDER_MARKER_RE = /\/\*!\s*weapp-tailwindcss generator-placeholder\s*\*\//i
export const GENERATOR_PLACEHOLDER_MARKER_GLOBAL_RE = /\/\*!\s*weapp-tailwindcss generator-placeholder\s*\*\/\s*/gi
export const TAILWIND_BANNER_PREFIX_RE = /^\/\*!\s*tailwindcss v[^*]*\*\/\s*/i
export const TAILWIND_BANNER_RE = /\/\*!\s*tailwindcss v[^*]*\*\//i
export const TAILWIND_BANNER_GLOBAL_RE = /\/\*!\s*tailwindcss v[^*]*\*\/\s*/gi
export const VITE_MARKER_RE = /\/\*\$vite\$:[^*]*\*\//g

export function removeDuplicatedViteMarkers(css: string, baseCss: string) {
  if (!VITE_MARKER_RE.test(baseCss)) {
    return css
  }
  VITE_MARKER_RE.lastIndex = 0
  return css.replace(VITE_MARKER_RE, '')
}

export function createCssAppend(base: string, extra: string) {
  if (!base) {
    return extra
  }
  if (!extra) {
    return base
  }
  return `${base}\n${extra}`
}

export function splitTailwindV4GeneratedCss(rawSource: string, rawTailwindCss: string) {
  const parts = splitTailwindV4GeneratedCssBySourceOrder(rawSource, rawTailwindCss)
  if (!parts) {
    return parts
  }
  return createCssAppend(parts.before, parts.after)
}

export function splitTailwindV4GeneratedCssBySourceOrder(rawSource: string, rawTailwindCss: string) {
  const trimmedRaw = rawSource.trim()
  const trimmedTailwind = rawTailwindCss.trim()
  if (trimmedRaw === trimmedTailwind) {
    return {
      before: '',
      after: '',
    }
  }
  if (trimmedTailwind.startsWith(trimmedRaw)) {
    return {
      before: '',
      after: '',
    }
  }

  const start = rawSource.indexOf(rawTailwindCss)
  if (start === -1) {
    return
  }

  return {
    before: rawSource.slice(0, start),
    after: rawSource.slice(start + rawTailwindCss.length),
  }
}

export function splitGeneratorPlaceholderCssBySourceOrder(rawSource: string, rawTailwindCss?: string) {
  const match = GENERATOR_PLACEHOLDER_MARKER_RE.exec(rawSource)
  if (!match || match.index === undefined) {
    return
  }
  let afterStart = match.index + match[0].length
  while (/\s/.test(rawSource[afterStart] ?? '')) {
    afterStart++
  }
  if (rawTailwindCss && rawSource.slice(afterStart).startsWith(rawTailwindCss)) {
    afterStart += rawTailwindCss.length
    while (/\s/.test(rawSource[afterStart] ?? '')) {
      afterStart++
    }
  }

  return {
    before: rawSource.slice(0, match.index),
    after: rawSource.slice(afterStart),
  }
}

export function removeTailwindGeneratedCssByBanner(rawSource: string) {
  const match = TAILWIND_BANNER_RE.exec(rawSource)
  if (!match || match.index === undefined) {
    return
  }
  const parts = splitTailwindGeneratedCssByBanner(rawSource, match.index)
  if (!parts) {
    return parts
  }
  return createCssAppend(parts.before, parts.after)
}

export function splitTailwindGeneratedCssByBanner(rawSource: string, start?: number) {
  const match = start === undefined ? TAILWIND_BANNER_RE.exec(rawSource) : { index: start }
  if (!match || match.index === undefined) {
    return
  }
  const before = rawSource.slice(0, match.index)
  const after = rawSource.slice(match.index)
  const viteMarkers = [...after.matchAll(VITE_MARKER_RE)]
    .map(item => item[0])
    .join('\n')
  return {
    before,
    after: viteMarkers,
  }
}

export function stripTailwindBanner(css: string) {
  return css.replace(TAILWIND_BANNER_PREFIX_RE, '')
}

export function stripTailwindBanners(css: string) {
  return css.replace(TAILWIND_BANNER_GLOBAL_RE, '')
}

/** 仅移除 AST 中的 Tailwind 版权注释，保留其它注释和声明字面量。 */
export function stripTailwindBannerComments(root: postcss.Root | postcss.Document) {
  root.walkComments((comment) => {
    if (/^!\s*tailwindcss v/i.test(comment.text)) {
      comment.remove()
    }
  })
}

export function stripGeneratorPlaceholderMarkers(css: string) {
  return css.replace(GENERATOR_PLACEHOLDER_MARKER_GLOBAL_RE, '')
}

export function hasTailwindGeneratedCss(rawSource: string) {
  return TAILWIND_V4_BANNER_RE.test(rawSource)
}

export function hasTailwindGeneratedCssMarkers(rawSource: string) {
  if (
    rawSource.includes('--tw-')
    || rawSource.includes('tailwindcss v')
    || rawSource.includes(':not(#\\#)')
    || GENERATOR_PLACEHOLDER_MARKER_RE.test(rawSource)
  ) {
    return true
  }
  if (
    !rawSource.includes('\\:')
    && !rawSource.includes('\\[')
    && !rawSource.includes('\\#')
    && !rawSource.includes('--color-')
    && !rawSource.includes('--spacing')
    && !rawSource.includes('--text-')
    && !rawSource.includes('--font-')
    && !rawSource.includes('--font-weight-')
    && !rawSource.includes('--default-')
    && !rawSource.includes('--radius-')
  ) {
    return false
  }
  return TAILWIND_ESCAPED_UTILITY_MARKER_RE.test(rawSource)
    || TAILWIND_ROOT_THEME_MARKER_RE.test(rawSource)
}
