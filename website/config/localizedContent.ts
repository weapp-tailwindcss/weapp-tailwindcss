import type { SiteLocale } from '../src/i18n/locale'

export const englishBlogSourceFiles = [
  '2025/9/v4.3-release.md',
] as const

export const englishDocsDirectory = 'i18n/en/docusaurus-plugin-content-docs/current'
export const englishBlogDirectory = 'i18n/en/docusaurus-plugin-content-blog'

export function getDocsDirectory(locale: SiteLocale): string {
  return locale === 'en' ? englishDocsDirectory : 'docs'
}

export function getBlogDirectory(locale: SiteLocale): string {
  return locale === 'en' ? englishBlogDirectory : 'blog'
}
