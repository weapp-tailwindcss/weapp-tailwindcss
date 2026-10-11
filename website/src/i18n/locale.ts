export const siteLocales = ['en', 'zh-cn'] as const

export type SiteLocale = (typeof siteLocales)[number]

export const defaultSiteLocale: SiteLocale = 'en'
export const localePreferenceStorageKey = 'weapp-tailwindcss:website:locale'

const ENGLISH_PREFIX_RE = /^en(?:[-_]|$)/i
const CHINESE_PREFIX_RE = /^zh(?:[-_]|$)/i
const CHINESE_LOCALE_PATH_RE = /^\/zh-cn(?=\/|$)/i
const REPEATED_PATH_SEPARATOR_RE = /\/{2,}/g

function normalizePathname(pathname: string): string {
  if (!pathname) {
    return '/'
  }
  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`
  return withLeadingSlash.replace(REPEATED_PATH_SEPARATOR_RE, '/')
}

export function normalizeSiteLocale(value?: string | null): SiteLocale {
  if (!value) {
    return defaultSiteLocale
  }
  if (ENGLISH_PREFIX_RE.test(value)) {
    return 'en'
  }
  if (CHINESE_PREFIX_RE.test(value)) {
    return 'zh-cn'
  }
  return defaultSiteLocale
}

export function isEnglishLocale(locale: SiteLocale): boolean {
  return locale === 'en'
}

export function getLocalePrefix(locale: SiteLocale): string {
  return isEnglishLocale(locale) ? '' : '/zh-cn'
}

export function stripLocalePrefix(pathname: string): string {
  let normalizedPathname = normalizePathname(pathname)

  while (CHINESE_LOCALE_PATH_RE.test(normalizedPathname)) {
    normalizedPathname = normalizedPathname.replace(CHINESE_LOCALE_PATH_RE, '') || '/'
  }

  return normalizedPathname
}

export function toLocalePath(pathname: string, locale: SiteLocale): string {
  const strippedPath = stripLocalePrefix(pathname)

  if (locale === 'zh-cn') {
    return strippedPath === '/' ? '/zh-cn/' : `/zh-cn${strippedPath}`
  }

  return strippedPath
}

export function getAlternateLocalePathMap(pathname: string): Record<SiteLocale, string> {
  return {
    'zh-cn': toLocalePath(pathname, 'zh-cn'),
    'en': toLocalePath(pathname, 'en'),
  }
}

export function toAbsoluteLocaleUrl(siteUrl: string, pathname: string, locale: SiteLocale): string {
  const baseUrl = siteUrl.replace(/\/$/, '')
  return `${baseUrl}${toLocalePath(pathname, locale)}`
}
