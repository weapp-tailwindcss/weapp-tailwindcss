import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { seoLocales, websiteRoot } from './seo-locales.mjs'
import {
  buildFallbackDescription,
  extractDescription,
  extractFirstHeading,
  readMatterFile,
  resolveKeywords,
  toBlogRoute,
  toDocRoute,
  walkMarkdownFiles,
} from './seo-shared.mjs'
import { writeStableJson } from './write-stable-json.mjs'

const siteUrl = (process.env.SITE_URL || 'https://tw.weapp.dev').replace(/\/$/, '')
const BACKSLASH_RE = /\\/g
const EXTENSION_RE = /\.(md|mdx)$/i
const TITLE_SEPARATOR_RE = /[-_]/g
const primaryProductAreas = new Set([
  'intro',
  'quick-start',
  'tailwindcss',
  'tools',
  'api',
  'options',
  'runtime',
  'migrations',
  'issues',
  'uni-app-x',
])

function resolveTitle(data, content, absPath, locale) {
  return (typeof data.title === 'string' && data.title.trim())
    || extractFirstHeading(content)
    || path.basename(absPath, path.extname(absPath)).replace(TITLE_SEPARATOR_RE, ' ').trim()
    || (locale === 'en' ? 'Document' : '文档')
}

function resolveDescription(data, content, title, relativePath, locale) {
  if (typeof data.description === 'string' && data.description.trim()) {
    return data.description.trim()
  }
  return extractDescription(content)
    || (locale === 'en'
      ? `${title} explains the current weapp-tailwindcss workflow, configuration, and cross-platform integration.`
      : buildFallbackDescription(title, relativePath))
}

function resolveHeadings(content) {
  return content
    .split('\n')
    .filter(line => /^#{2,3}\s/.test(line))
    .map(line => line.replace(/^#{2,3}\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 12)
}

function getProductArea(kind, relativePath) {
  if (kind === 'blog') {
    return 'blog'
  }
  const normalized = relativePath.replace(BACKSLASH_RE, '/').replace(EXTENSION_RE, '')
  if (normalized === 'intro' || normalized === 'index') {
    return 'intro'
  }
  return normalized.split('/')[0] || 'docs'
}

function getContentTier(kind, productArea, relativePath) {
  const normalizedPath = relativePath.replace(BACKSLASH_RE, '/')
  return kind === 'doc'
    && primaryProductAreas.has(productArea)
    && !normalizedPath.startsWith('tailwindcss/history/')
    ? 'primary'
    : 'full'
}

function toLocalizedPath(routePath, prefix) {
  return prefix ? `${prefix}${routePath}` : routePath
}

function toAlternates(routePath) {
  return {
    'en-US': `${siteUrl}${routePath}`,
    'zh-CN': `${siteUrl}/zh-cn${routePath}`,
    'x-default': `${siteUrl}${routePath}`,
  }
}

function toDate(data) {
  const candidate = data.last_updated_at || data.lastUpdatedAt || data.date
  if (!candidate) {
    return undefined
  }
  const date = new Date(candidate)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function buildRecords(localeConfig, kind) {
  const contentRoot = kind === 'doc' ? localeConfig.docsRoot : localeConfig.blogRoot
  return walkMarkdownFiles(contentRoot).map((absPath) => {
    const relative = path.relative(contentRoot, absPath).replace(BACKSLASH_RE, '/')
    const { parsed } = readMatterFile(absPath)
    const title = resolveTitle(parsed.data, parsed.content, absPath, localeConfig.id)
    const baseRoute = kind === 'doc'
      ? toDocRoute(relative, parsed.data.slug)
      : toBlogRoute(relative, parsed.data.slug)
    const routePath = toLocalizedPath(baseRoute, localeConfig.routePrefix)
    const description = resolveDescription(parsed.data, parsed.content, title, relative, localeConfig.id)
    const productArea = getProductArea(kind, relative)
    const updatedAt = toDate(parsed.data)
    return {
      kind,
      id: `${kind}:${relative.replace(EXTENSION_RE, '')}`,
      locale: localeConfig.language,
      contentTier: getContentTier(kind, productArea, relative),
      productArea,
      title,
      description,
      summary: extractDescription(parsed.content, 220) || description,
      url: routePath,
      canonical: `${siteUrl}${routePath}`,
      alternates: toAlternates(baseRoute),
      keywords: resolveKeywords({
        existingKeywords: parsed.data.keywords,
        locale: localeConfig.id,
        title,
        relativePath: relative,
      }),
      headings: resolveHeadings(parsed.content),
      source: `${localeConfig.sourcePrefix}${localeConfig.sourcePrefix ? '/' : ''}${kind === 'doc' ? 'docs' : 'blog'}/${relative}`,
      ...(updatedAt ? { updatedAt } : {}),
    }
  })
}

export function createGeoIndexPayload(locale = 'zh-cn', tier = 'primary', now = new Date().toISOString()) {
  const localeConfig = seoLocales.find(item => item.id === locale)
  if (!localeConfig) {
    throw new Error(`不支持的站点语言：${locale}`)
  }
  const allDocuments = [
    ...buildRecords(localeConfig, 'doc'),
    ...buildRecords(localeConfig, 'blog'),
  ].sort((a, b) => a.url.localeCompare(b.url))
  const documents = tier === 'primary'
    ? allDocuments.filter(document => document.contentTier === 'primary')
    : allDocuments
  return {
    version: '2.0.0',
    generatedAt: now,
    locale: localeConfig.language,
    contentTier: tier,
    siteUrl: `${siteUrl}${localeConfig.routePrefix}`,
    totals: {
      all: documents.length,
      docs: documents.filter(document => document.kind === 'doc').length,
      blog: documents.filter(document => document.kind === 'blog').length,
    },
    documents,
  }
}

export function createEnglishGeoIndexPayload(now = new Date().toISOString(), tier = 'primary') {
  return createGeoIndexPayload('en', tier, now)
}

export function writeGeoIndex(now = new Date().toISOString()) {
  const results = []
  for (const localeConfig of seoLocales) {
    for (const tier of ['primary', 'full']) {
      const payload = createGeoIndexPayload(localeConfig.id, tier, now)
      const filename = tier === 'primary' ? 'llms-index.json' : 'llms-index-full.json'
      const outputFile = path.join(localeConfig.staticRoot, filename)
      results.push({
        changed: writeStableJson(outputFile, payload),
        locale: localeConfig.id,
        outputFile,
        payload,
        tier,
      })
    }
  }
  return results
}

function main() {
  for (const result of writeGeoIndex()) {
    const suffix = result.changed ? '' : ' (unchanged)'
    console.log(`GEO index generated: ${path.relative(websiteRoot, result.outputFile)} (locale=${result.locale}, tier=${result.tier}, documents=${result.payload.totals.all})${suffix}`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
