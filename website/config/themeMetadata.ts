import type { ThemeConfig } from '@docusaurus/preset-classic'
import { getSiteConfigCopy } from '../src/i18n/siteConfig'
import { getBuildLocale } from './buildLocale'
import { defaultMetaDescription, defaultMetaTitle, siteName, siteUrl, socialImageUrl } from './siteMetadata'

const currentLocale = getBuildLocale()
const copy = getSiteConfigCopy(currentLocale)

const themeMetadata: NonNullable<ThemeConfig['metadata']> = [
  {
    name: 'keywords',
    content: copy.metadata.themeKeywords.join(','),
  },
  {
    name: 'description',
    content: defaultMetaDescription,
  },
  {
    property: 'og:title',
    content: defaultMetaTitle,
  },
  {
    property: 'og:description',
    content: defaultMetaDescription,
  },
  {
    property: 'og:image',
    content: socialImageUrl,
  },
  {
    property: 'og:url',
    content: siteUrl,
  },
  {
    name: 'author',
    content: 'icebreaker & weapp-tailwindcss contributors',
  },
  {
    name: 'theme-color',
    content: '#07c160',
  },
  {
    property: 'og:type',
    content: 'website',
  },
  {
    property: 'og:locale',
    content: copy.metadata.ogLocale,
  },
  {
    property: 'og:site_name',
    content: siteName,
  },
  {
    property: 'og:image:alt',
    content: copy.metadata.socialImageAlt,
  },
  {
    property: 'og:image:width',
    content: '1200',
  },
  {
    property: 'og:image:height',
    content: '630',
  },
  {
    property: 'og:image:type',
    content: 'image/png',
  },
  {
    name: 'twitter:card',
    content: 'summary_large_image',
  },
  {
    name: 'twitter:image',
    content: socialImageUrl,
  },
  {
    name: 'twitter:image:alt',
    content: copy.metadata.socialImageAlt,
  },
  {
    name: 'twitter:description',
    content: defaultMetaDescription,
  },
  {
    name: 'twitter:title',
    content: defaultMetaTitle,
  },
]

export default themeMetadata
