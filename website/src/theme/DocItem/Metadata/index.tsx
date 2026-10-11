import Head from '@docusaurus/Head'
import { useDoc } from '@docusaurus/plugin-content-docs/client'
import {
  getSiteLanguage,
  getSocialImageAlt,
  getSocialImageUrl,
  organizationId,
  siteUrl,
  softwareId,
  websiteId,
} from '@site/config/siteMetadata'
import { toAbsoluteLocaleUrl } from '@site/src/i18n/locale'
import { useCurrentSiteLocale } from '@site/src/i18n/runtime'
import { getSiteConfigCopy } from '@site/src/i18n/siteConfig'
import { toIsoDate } from '@site/src/utils/content-date'
import { resolveSeoDescription, resolveSeoKeywords, toAbsoluteUrl } from '@site/src/utils/seo'
import OriginalMetadata from '@theme-original/DocItem/Metadata'
import React from 'react'

type DocItemMetadataProps = React.ComponentProps<typeof OriginalMetadata>

export default function DocItemMetadata(props: DocItemMetadataProps) {
  const locale = useCurrentSiteLocale()
  const { metadata, assets } = useDoc()
  const copy = getSiteConfigCopy(locale)
  const siteLanguage = getSiteLanguage(locale)
  const alternateZhUrl = toAbsoluteLocaleUrl(siteUrl, metadata.permalink, 'zh-cn')
  const alternateEnUrl = toAbsoluteLocaleUrl(siteUrl, metadata.permalink, 'en')

  const canonicalUrl = toAbsoluteLocaleUrl(siteUrl, metadata.permalink, locale)
  const defaultImageUrl = getSocialImageUrl(locale)
  const imageUrl = toAbsoluteUrl(siteUrl, assets?.image ?? metadata.frontMatter.image) || defaultImageUrl
  const imageAlt = getSocialImageAlt(locale)
  const publishedTime = toIsoDate(metadata.frontMatter.date, 'seconds')
  // 官方更新时间是毫秒，自定义 front matter 数字日期保留原有的秒约定。
  const modifiedTime = toIsoDate(metadata.lastUpdatedAt, 'milliseconds')
    ?? toIsoDate(metadata.frontMatter.last_updated_at, 'seconds')
  const description = resolveSeoDescription({
    description: metadata.description ?? metadata.frontMatter?.description,
    title: metadata.title,
    locale,
  })
  const keywords = resolveSeoKeywords({
    title: metadata.title,
    permalink: metadata.permalink,
    frontMatterKeywords: metadata.frontMatter?.keywords,
    locale,
  })
  const docJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${canonicalUrl}#article`,
    'headline': metadata.title,
    'description': description,
    'image': imageUrl ? [imageUrl] : undefined,
    'datePublished': publishedTime,
    'dateModified': modifiedTime,
    'inLanguage': siteLanguage,
    'mainEntityOfPage': { '@id': `${canonicalUrl}#webpage` },
    'url': canonicalUrl,
    'keywords': keywords,
    'publisher': { '@id': organizationId },
    'about': { '@id': softwareId },
    'isPartOf': { '@id': websiteId },
  }

  return (
    <>
      <OriginalMetadata {...props} />
      <Head>
        <link rel="canonical" href={canonicalUrl} />
        <meta name="description" content={description} />
        <meta name="keywords" content={keywords.join(', ')} />
        <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={metadata.title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={imageUrl} />
        <meta property="og:image:alt" content={imageAlt} />
        {imageUrl === defaultImageUrl && <meta property="og:image:width" content="1200" />}
        {imageUrl === defaultImageUrl && <meta property="og:image:height" content="630" />}
        {imageUrl === defaultImageUrl && <meta property="og:image:type" content="image/png" />}
        <meta property="og:locale" content={copy.metadata.ogLocale} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metadata.title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={imageUrl} />
        <meta name="twitter:image:alt" content={imageAlt} />
        <link rel="alternate" hrefLang="zh-CN" href={alternateZhUrl} />
        <link rel="alternate" hrefLang="en-US" href={alternateEnUrl} />
        <link rel="alternate" hrefLang="x-default" href={alternateEnUrl} />
        {publishedTime && <meta property="article:published_time" content={publishedTime} />}
        {modifiedTime && <meta property="article:modified_time" content={modifiedTime} />}
        <meta httpEquiv="Content-Language" content={siteLanguage} />
        <script id="doc-jsonld" type="application/ld+json">
          {JSON.stringify(docJsonLd)}
        </script>
      </Head>
    </>
  )
}
