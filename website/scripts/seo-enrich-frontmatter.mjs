import path from 'node:path'
import process from 'node:process'
import { seoLocales } from './seo-locales.mjs'
import { isDescriptionValid, isKeywordsNormalized } from './seo-quality-lib.mjs'
import {
  buildFallbackDescription,
  containsHan,
  extractFirstHeading,
  readMatterFile,
  resolveKeywords,
  walkMarkdownFiles,
  writeMatterFile,
} from './seo-shared.mjs'

const TITLE_SEPARATOR_RE = /[-_]/g

function createDescription(locale, title, relativePath) {
  if (locale === 'en') {
    const section = relativePath.split(path.sep)[0]
    const suffix = {
      'api': 'API contracts, types, and integration details for cross-platform Tailwind CSS workflows.',
      'issues': 'Troubleshooting guidance, compatibility notes, and verified solutions for cross-platform builds.',
      'migrations': 'Upgrade guidance, compatibility changes, and migration steps for current releases.',
      'quick-start': 'Installation, configuration, and framework setup for Tailwind CSS 4 across supported platforms.',
      'tools': 'CLI commands, build workflows, and developer tooling for weapp-tailwindcss projects.',
    }[section] || 'Current concepts, configuration guidance, and practical examples for weapp-tailwindcss users.'
    return `${title}: ${suffix}`
  }
  return buildFallbackDescription(title, relativePath)
}

function processFile(absPath, rootDir, locale, write) {
  const { parsed } = readMatterFile(absPath)
  const data = { ...parsed.data }
  const relativePath = path.relative(rootDir, absPath)
  let changed = false

  if (typeof data.title !== 'string' || !data.title.trim()) {
    data.title = extractFirstHeading(parsed.content)
      || path.basename(absPath, path.extname(absPath)).replace(TITLE_SEPARATOR_RE, ' ').trim()
      || (locale === 'en' ? 'Document' : '文档')
    changed = true
  }

  if (!isDescriptionValid(data.description)) {
    data.description = createDescription(locale, data.title, relativePath)
    changed = true
  }

  const hasEnoughKeywords = Array.isArray(data.keywords)
    && data.keywords.length >= 8
    && (locale !== 'en' || data.keywords.every(keyword => !containsHan(keyword)))
  if (!hasEnoughKeywords || !isKeywordsNormalized(data.keywords)) {
    const keywords = resolveKeywords({
      existingKeywords: data.keywords,
      locale: locale === 'en' ? locale : undefined,
      title: data.title,
      relativePath,
    })
    data.keywords = keywords
    changed = true
  }

  if (changed && write) {
    writeMatterFile(absPath, parsed, data)
  }
  return changed
}

const write = process.argv.includes('--write')
const results = []
for (const locale of seoLocales) {
  for (const [kind, rootDir] of [['docs', locale.docsRoot], ['blog', locale.blogRoot]]) {
    const files = walkMarkdownFiles(rootDir)
    const changed = files.filter(file => processFile(file, rootDir, locale.id, write)).length
    results.push({ scope: `${locale.id}:${kind}`, scanned: files.length, changed })
  }
}
console.table(results)
if (!write) {
  console.log('当前为预览模式，添加 --write 才会写入文件。')
}
