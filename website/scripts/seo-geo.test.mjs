import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getOrganizationJsonLd,
  getSoftwareJsonLd,
  getWebsiteJsonLd,
  organizationId,
  softwareId,
  websiteId,
} from '../config/siteMetadata.ts'
import { createGeoIndexPayload } from './generate-geo-index.mjs'
import { createRedirectRules, validateRedirectRules } from './redirects.mjs'
import { websiteRoot } from './seo-locales.mjs'
import { buildFileIssues } from './seo-quality-lib.mjs'
import { resolveKeywords } from './seo-shared.mjs'

function readPngSize(filePath) {
  const content = fs.readFileSync(filePath)
  return {
    width: content.readUInt32BE(16),
    height: content.readUInt32BE(20),
  }
}

describe('website SEO and GEO contracts', () => {
  it('uses root canonicals for English and /zh-cn for Chinese', () => {
    const english = createGeoIndexPayload('en', 'primary', '2026-01-01T00:00:00.000Z')
    const chinese = createGeoIndexPayload('zh-cn', 'primary', '2026-01-01T00:00:00.000Z')
    expect(english.documents.length).toBeGreaterThan(0)
    expect(english.documents.every(item => !new URL(item.canonical).pathname.startsWith('/en/'))).toBe(true)
    expect(chinese.documents.every(item => new URL(item.canonical).pathname.startsWith('/zh-cn/'))).toBe(true)
    expect(english.documents.every(item => item.alternates['x-default'] === item.alternates['en-US'])).toBe(true)
  })

  it('keeps blogs and generic AI/history content out of the primary index', () => {
    const primary = createGeoIndexPayload('en', 'primary')
    const full = createGeoIndexPayload('en', 'full')
    expect(full.documents.length).toBeGreaterThan(primary.documents.length)
    expect(primary.documents.every(item => item.contentTier === 'primary')).toBe(true)
    expect(primary.documents.some(item => item.kind === 'blog')).toBe(false)
    expect(primary.documents.some(item => item.source.includes('/ai/'))).toBe(false)
    expect(primary.documents.some(item => item.source.includes('/history/'))).toBe(false)
  })

  it('keeps English keyword normalization free of Chinese fallback values', () => {
    const keywords = resolveKeywords({
      existingKeywords: ['配置项', 'existing keyword'],
      locale: 'en',
      relativePath: 'options/index.md',
      title: 'Plugin Options',
    })
    expect(keywords).toEqual(expect.arrayContaining(['options', 'plugin options', 'configuration', 'existing keyword']))
    expect(keywords.join('')).not.toMatch(/\p{Script=Han}/u)
  })

  it('preserves the Chinese GEO keyword contract', () => {
    const keywords = resolveKeywords({
      locale: 'zh-cn',
      relativePath: 'options/index.md',
      title: '配置项',
    })
    expect(keywords).toEqual(expect.arrayContaining(['Tailwind CSS 4', '跨端', '小程序', 'Taro']))
  })

  it('rejects code, lists, URLs, and Markdown descriptions', () => {
    for (const description of ['1. Install dependencies', 'function submit() {', 'Read https://example.com', '**Setup** guide']) {
      expect(buildFileIssues({ description, keywords: Array.from({ length: 8 }, (_, index) => `key-${index}`) }, 'doc.md'))
        .toEqual(expect.arrayContaining([expect.objectContaining({ type: 'invalid_description' })]))
    }
  })

  it('expands bilingual legacy redirects to existing destinations', () => {
    const rules = createRedirectRules()
    expect(rules).toContainEqual(['/en/*', '/:splat', 301])
    for (const [source, destination] of [
      ['/docs/uni-app-x', '/docs/quick-start/frameworks/uni-app-x'],
      ['/docs/uni-app-x/install', '/docs/quick-start/frameworks/uni-app-x'],
      ['/docs/quick-start/unocss', '/docs/tailwindcss/unocss-compatibility'],
    ]) {
      expect(rules).toContainEqual([source, destination, 301])
      expect(rules).toContainEqual([`/zh-cn${source}`, `/zh-cn${destination}`, 301])
    }
    expect(() => validateRedirectRules(rules)).not.toThrow()
  })

  it('links the stable JSON-LD entity graph', () => {
    const organization = getOrganizationJsonLd('en')
    const website = getWebsiteJsonLd('en')
    const software = getSoftwareJsonLd('en')
    expect(organization['@id']).toBe(organizationId)
    expect(website.publisher).toEqual({ '@id': organizationId })
    expect(website.about).toEqual({ '@id': softwareId })
    expect(software.isPartOf).toEqual({ '@id': websiteId })
    expect(JSON.stringify([organization, website, software])).not.toContain('contentLocation')
  })

  it('ships 1200x630 social images for both locales', () => {
    for (const locale of ['en', 'zh-cn']) {
      expect(readPngSize(path.join(websiteRoot, 'static', 'img', 'social', `weapp-tailwindcss-${locale}.png`)))
        .toEqual({ width: 1200, height: 630 })
    }
  })
})
