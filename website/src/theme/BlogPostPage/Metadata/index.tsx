import Head from '@docusaurus/Head'
import { useBlogPost } from '@docusaurus/plugin-content-blog/client'
import {
  getSiteLanguage,
  getSocialImageAlt,
  getSocialImageUrl,
  siteUrl,
} from '@site/config/siteMetadata'
import { toAbsoluteLocaleUrl } from '@site/src/i18n/locale'
import { useCurrentSiteLocale } from '@site/src/i18n/runtime'
import { getSiteConfigCopy } from '@site/src/i18n/siteConfig'
import { toIsoDate } from '@site/src/utils/content-date'
import { resolveSeoDescription, resolveSeoKeywords, toAbsoluteUrl } from '@site/src/utils/seo'
import OriginalMetadata from '@theme-original/BlogPostPage/Metadata'
import React from 'react'

type BlogPostPageMetadataProps = React.ComponentProps<typeof OriginalMetadata>

export default function BlogPostPageMetadata(props: BlogPostPageMetadataProps) {
  const locale = useCurrentSiteLocale()
  const { metadata, frontMatter, assets } = useBlogPost()
  const copy = getSiteConfigCopy(locale)

  const canonicalUrl = toAbsoluteLocaleUrl(siteUrl, metadata.permalink, locale)
  const defaultImageUrl = getSocialImageUrl(locale)
  const imageUrl = toAbsoluteUrl(siteUrl, assets.image ?? frontMatter.image) || defaultImageUrl
  const imageAlt = getSocialImageAlt(locale)
  const publishedTime = metadata.date
  const modifiedTime = toIsoDate(metadata.lastUpdatedAt, 'milliseconds') ?? metadata.date
  const articleSection = 'category' in frontMatter && typeof frontMatter.category === 'string'
    ? frontMatter.category
    : metadata.tags[0]?.label ?? 'Blog'
  const language = 'lang' in frontMatter && typeof frontMatter.lang === 'string'
    ? frontMatter.lang
    : getSiteLanguage(locale)
  const alternateZhUrl = toAbsoluteLocaleUrl(siteUrl, metadata.permalink, 'zh-cn')
  const alternateEnUrl = toAbsoluteLocaleUrl(siteUrl, metadata.permalink, 'en')
  const description = resolveSeoDescription({
    description: metadata.description,
    title: metadata.title,
    locale,
  })
  const keywords = resolveSeoKeywords({
    title: metadata.title,
    permalink: metadata.permalink,
    metadataKeywords: metadata.tags?.map(tag => tag.label),
    locale,
  })
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
        <meta property="article:section" content={articleSection} />
        {publishedTime && <meta property="article:published_time" content={publishedTime} />}
        {modifiedTime && <meta property="article:modified_time" content={modifiedTime} />}
        {metadata.tags?.map(tag => (
          <meta key={tag.permalink ?? tag.label} property="article:tag" content={tag.label} />
        ))}
        {language && <meta httpEquiv="Content-Language" content={language} />}
      </Head>
    </>
  )
}
