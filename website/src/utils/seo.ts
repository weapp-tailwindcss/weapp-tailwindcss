import type { SiteLocale } from '@site/src/i18n/locale'
import { normalizeSiteLocale } from '@site/src/i18n/locale'
import { getSiteConfigCopy } from '@site/src/i18n/siteConfig'

const sectionPatterns = [
  {
    pattern: /\/docs\/quick-start(\/|$)/,
    key: 'quickStart',
  },
  {
    pattern: /\/docs\/issues(\/|$)/,
    key: 'issues',
  },
  {
    pattern: /\/docs\/api(\/|$)|\/docs\/options(\/|$)/,
    key: 'api',
  },
  {
    pattern: /\/docs\/ai(\/|$)/,
    key: 'ai',
  },
  {
    pattern: /\/blog(\/|$)/,
    key: 'blog',
  },
] as const

const KEYWORD_SPLIT_RE = /[，,、|/]/g
const CODE_BLOCK_RE = /```[\s\S]*?```/g
const INLINE_CODE_RE = /`([^`]+)`/g
const IMAGE_LINK_RE = /!\[[^\]]*\]\([^)]*\)/g
const MD_LINK_RE = /\[([^\]]+)\]\([^)]*\)/g
const HTML_TAG_RE = /<[^>]+>/g
const TITLE_TERM_RE = /[\p{L}\p{N}#+.-]+/gu
const HYPHEN_UNDERSCORE_RE = /[-_]/g
const WHITESPACE_RE = /\s+/g
const TRAILING_SLASH_RE = /\/$/

export function toAbsoluteUrl(siteUrl: string, value?: string | null) {
  if (!value) {
    return undefined
  }
  if (value.startsWith('http')) {
    return value
  }
  try {
    return new URL(value, siteUrl).toString()
  }
  catch {
    return undefined
  }
}

function normalizeKeywords(input?: string[] | string | null): string[] {
  if (!input) {
    return []
  }
  if (Array.isArray(input)) {
    return input.map(item => String(item).trim()).filter(Boolean)
  }
  return String(input)
    .split(KEYWORD_SPLIT_RE)
    .map(item => item.trim())
    .filter(Boolean)
}

function stripMarkdown(content: string) {
  return content
    .replace(CODE_BLOCK_RE, ' ')
    .replace(INLINE_CODE_RE, '$1')
    .replace(IMAGE_LINK_RE, ' ')
    .replace(MD_LINK_RE, '$1')
    .replace(HTML_TAG_RE, ' ')
}

function extractTitleTerms(title: string) {
  return (title.match(TITLE_TERM_RE) || [])
    .map(item => item.trim())
    .filter(item => item.length >= 2)
}

function extractPermalinkTerms(permalink: string) {
  return permalink
    .split('/')
    .filter(Boolean)
    .map(segment => decodeURIComponent(segment))
    .map(segment => segment.replace(HYPHEN_UNDERSCORE_RE, ' '))
    .map(segment => segment.trim())
    .filter(item => item.length >= 2)
}

export function resolveSeoDescription(params: {
  description?: string
  title: string
  fallbackText?: string
  maxLength?: number
  locale?: SiteLocale
}) {
  const locale = normalizeSiteLocale(params.locale)
  const copy = getSiteConfigCopy(locale)
  const maxLength = params.maxLength ?? 140
  const suffix = copy.seo.docSuffix
  const raw = [params.description, params.fallbackText, `${params.title} - ${suffix}`]
    .find(Boolean) || `${params.title} - ${suffix}`
  const normalized = stripMarkdown(String(raw)).replace(WHITESPACE_RE, ' ').trim()
  if (!normalized) {
    return `${params.title} - ${suffix}`
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

export function resolveSeoKeywords(params: {
  title: string
  permalink: string
  metadataKeywords?: string[] | string
  frontMatterKeywords?: string[] | string
  maxItems?: number
  locale?: SiteLocale
}) {
  const locale = normalizeSiteLocale(params.locale)
  const copy = getSiteConfigCopy(locale)
  const fromSection = sectionPatterns
    .filter(item => item.pattern.test(params.permalink))
    .flatMap(item => copy.seo.sectionKeywords[item.key])

  const merged = [
    ...normalizeKeywords(params.metadataKeywords),
    ...normalizeKeywords(params.frontMatterKeywords),
    ...fromSection,
    ...extractTitleTerms(params.title),
    ...extractPermalinkTerms(params.permalink),
    ...copy.seo.baseKeywords,
  ]
  const deduped = [...new Set(
    merged
      .map(item => item.trim())
      .filter(Boolean),
  )]
  return deduped.slice(0, params.maxItems ?? 20)
}

export function buildBreadcrumbJsonLd(params: {
  siteUrl: string
  permalink: string
  title: string
  locale?: SiteLocale
}) {
  const locale = normalizeSiteLocale(params.locale)
  const copy = getSiteConfigCopy(locale)
  const rootUrl = params.siteUrl.replace(TRAILING_SLASH_RE, '')
  const segments = params.permalink.split('/').filter(Boolean)
  const names: string[] = [copy.seo.breadcrumb.home]
  const items: string[] = [rootUrl]
  let current = ''

  for (const segment of segments) {
    current += `/${segment}`
    items.push(`${rootUrl}${current}`)
    if (segment === 'docs') {
      names.push(copy.seo.breadcrumb.docs)
      continue
    }
    if (segment === 'blog') {
      names.push(copy.seo.breadcrumb.blog)
      continue
    }
    names.push(decodeURIComponent(segment).replace(HYPHEN_UNDERSCORE_RE, ' '))
  }

  if (!segments.length || names.at(-1) !== params.title) {
    names.push(params.title)
    items.push(`${rootUrl}${params.permalink}`)
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${rootUrl}${params.permalink}#breadcrumb`,
    'itemListElement': names.map((name, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      name,
      'item': items[index] ?? `${rootUrl}${params.permalink}`,
    })),
  }
}
