import type { PropBlogPostContent } from '@docusaurus/plugin-content-blog'
import type { useBlogPostStructuredData } from '@docusaurus/plugin-content-blog/client'
import type { DocMetadata } from '@docusaurus/plugin-content-docs'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BlogPostMetadata from '../src/theme/BlogPostPage/Metadata'
import BlogPostStructuredData from '../src/theme/BlogPostPage/StructuredData'
import DocItemMetadata from '../src/theme/DocItem/Metadata'

const hooks = vi.hoisted(() => ({ useDoc: vi.fn(), useBlogPost: vi.fn(), useBlogPostStructuredData: vi.fn() }))
vi.mock('@docusaurus/plugin-content-docs/client', () => ({ useDoc: hooks.useDoc }))
vi.mock('@docusaurus/plugin-content-blog/client', () => ({ useBlogPost: hooks.useBlogPost, useBlogPostStructuredData: hooks.useBlogPostStructuredData }))
vi.mock('@docusaurus/Head', () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock('@theme-original/DocItem/Metadata', () => ({ default: () => null }))
vi.mock('@theme-original/BlogPostPage/Metadata', () => ({ default: () => null }))
vi.mock('@site/src/i18n/runtime', () => ({ useCurrentSiteLocale: () => 'en' }))

const modifiedTime = '2026-10-03T00:00:00.000Z'
const publishedTime = '2026-10-02T00:00:00.000Z'

function docMetadata(overrides: Partial<DocMetadata> = {}): DocMetadata {
  return {
    id: 'intro',
    version: 'current',
    title: 'Introduction',
    description: 'Introduction to the framework.',
    source: '@site/docs/intro.md',
    sourceDirName: '.',
    slug: '/intro',
    permalink: '/docs/intro',
    draft: false,
    unlisted: false,
    tags: [],
    frontMatter: { date: publishedTime },
    lastUpdatedAt: Date.parse(modifiedTime),
    lastUpdatedBy: null,
    ...overrides,
  }
}

function readJsonLd(html: string, scriptId: string) {
  const scripts = Array.from(html.matchAll(/<script\s[^>]*id="([^"]+)"[^>]*>([^<]*)<\/script>/g))
  const json = scripts.find(([, id]) => id === scriptId)?.[2]
  expect(json).toBeDefined()
  return JSON.parse(json!) as Record<string, unknown>
}

function readDocJsonLd(html: string) {
  return readJsonLd(html, 'doc-jsonld')
}

beforeEach(() => {
  hooks.useDoc.mockReset()
  hooks.useBlogPost.mockReset()
  hooks.useBlogPostStructuredData.mockReset()
})

describe('文档日期的真实 metadata 与 JSON-LD', () => {
  it('文档图片同样使用已解析的资源路径', () => {
    hooks.useDoc.mockReturnValue({ metadata: docMetadata({ frontMatter: { image: './cover.png' } }), assets: { image: '/assets/doc-cover.hash.png' } })
    const html = renderToStaticMarkup(createElement(DocItemMetadata))
    expect(readDocJsonLd(html).image).toEqual(['https://tw.weapp.dev/assets/doc-cover.hash.png'])
    expect(html).toContain('property="og:image" content="https://tw.weapp.dev/assets/doc-cover.hash.png"')
  })

  it('将官方毫秒时间一致写入 JSON-LD 和 Open Graph', () => {
    hooks.useDoc.mockReturnValue({ metadata: docMetadata() })
    const html = renderToStaticMarkup(createElement(DocItemMetadata))
    expect(readDocJsonLd(html)).toMatchObject({ datePublished: publishedTime, dateModified: modifiedTime })
    expect(html).toContain(`property="article:modified_time" content="${modifiedTime}"`)
  })

  it('仅对自定义 front matter 数字日期使用已有的秒约定', () => {
    hooks.useDoc.mockReturnValue({
      metadata: docMetadata({
        lastUpdatedAt: null,
        frontMatter: { date: Date.parse(publishedTime) / 1000, last_updated_at: Date.parse(modifiedTime) / 1000 },
      }),
    })
    const html = renderToStaticMarkup(createElement(DocItemMetadata))
    expect(readDocJsonLd(html)).toMatchObject({ datePublished: publishedTime, dateModified: modifiedTime })
  })

  it('保留官方零值时间，并忽略无效的自定义日期', () => {
    hooks.useDoc.mockReturnValue({ metadata: docMetadata({ lastUpdatedAt: 0, frontMatter: { date: { invalid: true } } }) })
    const data = readDocJsonLd(renderToStaticMarkup(createElement(DocItemMetadata)))
    expect(data.dateModified).toBe('1970-01-01T00:00:00.000Z')
    expect(data).not.toHaveProperty('datePublished')
  })

  it('无效或越界的日期不会让页面渲染抛错', () => {
    hooks.useDoc.mockReturnValue({ metadata: docMetadata({ lastUpdatedAt: null, frontMatter: { date: Number.POSITIVE_INFINITY, last_updated_at: 'invalid' } }) })
    const html = renderToStaticMarkup(createElement(DocItemMetadata))
    const data = readDocJsonLd(html)
    expect(data).not.toHaveProperty('datePublished')
    expect(data).not.toHaveProperty('dateModified')
    expect(html).not.toContain('article:published_time')
    expect(html).not.toContain('article:modified_time')
  })
})

describe('博客 metadata 的官方字段', () => {
  function renderBlog(frontMatter: PropBlogPostContent['metadata']['frontMatter'] = {}) {
    const metadata: PropBlogPostContent['metadata'] = {
      source: '@site/blog/post.md',
      title: 'Release notes',
      date: publishedTime,
      lastUpdatedAt: Date.parse(modifiedTime),
      lastUpdatedBy: null,
      permalink: '/blog/release',
      description: 'The normalized blog description.',
      hasTruncateMarker: false,
      authors: [],
      frontMatter,
      tags: [{ label: 'Release', permalink: '/blog/tags/release', description: 'Release updates', inline: true }],
      unlisted: false,
    }
    hooks.useBlogPost.mockReturnValue({ metadata, frontMatter, assets: { image: '/assets/cover.hash.png' } })
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      'url': 'https://tw.weapp.dev/blog/release',
      'datePublished': publishedTime,
      'dateModified': modifiedTime,
      'image': {
        '@type': 'ImageObject',
        '@id': 'https://tw.weapp.dev/assets/cover.hash.png',
        'url': 'https://tw.weapp.dev/assets/cover.hash.png',
        'contentUrl': 'https://tw.weapp.dev/assets/cover.hash.png',
        'caption': 'title image for the blog post: Release notes',
      },
    } satisfies ReturnType<typeof useBlogPostStructuredData>
    hooks.useBlogPostStructuredData.mockReturnValue(structuredData)
    return renderToStaticMarkup(createElement(BlogPostMetadata))
  }

  it('使用已解析的图片资源和官方更新时间', () => {
    const html = renderBlog({ image: './cover.png', category: 'Changelog', lang: 'zh-CN' })
    expect(html).toContain('property="og:image" content="https://tw.weapp.dev/assets/cover.hash.png"')
    expect(html).toContain(`property="article:modified_time" content="${modifiedTime}"`)
    expect(html).toContain('property="article:section" content="Changelog"')
    expect(html).toContain('http-equiv="Content-Language" content="zh-CN"')
    const jsonLd = readJsonLd(renderToStaticMarkup(createElement(BlogPostStructuredData)), 'blog-post-jsonld')
    expect(jsonLd).toMatchObject({
      '@id': 'https://tw.weapp.dev/blog/release#article',
      'datePublished': publishedTime,
      'dateModified': modifiedTime,
      'image': { '@type': 'ImageObject', 'url': 'https://tw.weapp.dev/assets/cover.hash.png' },
    })
    expect(html).toContain(`property="article:published_time" content="${jsonLd.datePublished}"`)
    expect(html).toContain(`property="article:modified_time" content="${jsonLd.dateModified}"`)
    expect(html).toContain(`property="og:image" content="${(jsonLd.image as Record<string, unknown>).url}"`)
  })

  it('不把未知形状的自定义字段输出为页面元数据', () => {
    const html = renderBlog({ category: { invalid: true }, lang: false })
    expect(html).toContain('property="article:section" content="Release"')
    expect(html).toContain('http-equiv="Content-Language" content="en-US"')
    expect(html).not.toContain('[object Object]')
  })
})
