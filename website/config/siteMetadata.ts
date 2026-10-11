import type { SiteLocale } from '../src/i18n/locale'
import { getSiteConfigCopy } from '../src/i18n/siteConfig'
import { getBuildLocale } from './buildLocale'

// eslint-disable-next-line node/prefer-global/process -- 此模块也会进入浏览器 bundle，需安全访问可选的 Node 全局
const envSiteUrl = globalThis.process?.env.SITE_URL

export const siteUrl = (envSiteUrl || 'https://tw.weapp.dev').replace(/\/$/, '')
export const siteName = 'weapp-tailwindcss'
export const organizationId = `${siteUrl}/#organization`
export const websiteId = `${siteUrl}/#website`
export const softwareId = `${siteUrl}/#software`
export const currentSiteLocale = getBuildLocale()

export function getSiteLanguage(locale: SiteLocale) {
  return getSiteConfigCopy(locale).metadata.siteLanguage
}

export function getDefaultMetaTitle(locale: SiteLocale) {
  return getSiteConfigCopy(locale).metadata.defaultMetaTitle
}

export function getDefaultMetaDescription(locale: SiteLocale) {
  return getSiteConfigCopy(locale).metadata.defaultMetaDescription
}

export function getSocialImageAlt(locale: SiteLocale) {
  return getSiteConfigCopy(locale).metadata.socialImageAlt
}

export function getSocialImageUrl(locale: SiteLocale) {
  return `${siteUrl}/img/social/weapp-tailwindcss-${locale === 'en' ? 'en' : 'zh-cn'}.png`
}

export function getOrganizationJsonLd(locale: SiteLocale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': organizationId,
    'name': siteName,
    'url': siteUrl,
    'description': getDefaultMetaDescription(locale),
    'logo': {
      '@type': 'ImageObject',
      '@id': `${siteUrl}/#logo`,
      'url': getSocialImageUrl(locale),
      'width': 1200,
      'height': 630,
    },
    'founder': {
      '@type': 'Person',
      'name': 'sonofmagic',
      'url': 'https://github.com/sonofmagic',
    },
    'sameAs': [
      'https://github.com/weapp-tailwindcss/weapp-tailwindcss',
      'https://www.npmjs.com/package/weapp-tailwindcss',
    ],
  } as const
}

export function getWebsiteJsonLd(locale: SiteLocale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': websiteId,
    'name': siteName,
    'url': siteUrl,
    'description': getDefaultMetaDescription(locale),
    'inLanguage': getSiteLanguage(locale),
    'publisher': { '@id': organizationId },
    'about': { '@id': softwareId },
    'potentialAction': {
      '@type': 'SearchAction',
      'target': `${siteUrl}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  } as const
}

export function getSoftwareJsonLd(locale: SiteLocale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    '@id': softwareId,
    'name': siteName,
    'url': siteUrl,
    'codeRepository': 'https://github.com/weapp-tailwindcss/weapp-tailwindcss',
    'description': getDefaultMetaDescription(locale),
    'inLanguage': ['TypeScript', 'JavaScript'],
    'programmingLanguage': ['TypeScript', 'JavaScript'],
    'runtimePlatform': ['Node.js', 'Web', 'Mini Apps', 'React Native', 'Lynx'],
    'license': 'https://github.com/weapp-tailwindcss/weapp-tailwindcss/blob/main/LICENSE',
    'author': { '@id': organizationId },
    'isPartOf': { '@id': websiteId },
  } as const
}

export const siteLanguage = getSiteLanguage(currentSiteLocale)
export const defaultMetaTitle = getDefaultMetaTitle(currentSiteLocale)
export const defaultMetaDescription = getDefaultMetaDescription(currentSiteLocale)
export const socialImageUrl = getSocialImageUrl(currentSiteLocale)
export const organizationJsonLd = getOrganizationJsonLd(currentSiteLocale)
export const websiteJsonLd = getWebsiteJsonLd(currentSiteLocale)
export const softwareJsonLd = getSoftwareJsonLd(currentSiteLocale)
