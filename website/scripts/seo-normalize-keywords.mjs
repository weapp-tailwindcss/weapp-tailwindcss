import path from 'node:path'
import process from 'node:process'
import { seoLocales } from './seo-locales.mjs'
import { isKeywordsNormalized } from './seo-quality-lib.mjs'
import { containsHan, readMatterFile, resolveKeywords, walkMarkdownFiles, writeMatterFile } from './seo-shared.mjs'

const options = {
  write: process.argv.includes('--write'),
  maxItems: Number(process.argv.find(arg => arg.startsWith('--max-items='))?.split('=')[1]) || 16,
}

function normalizeFile(filePath, rootDir, locale) {
  const { parsed } = readMatterFile(filePath)
  const relativePath = path.relative(rootDir, filePath)
  if (Array.isArray(parsed.data.keywords)
    && parsed.data.keywords.length >= 8
    && isKeywordsNormalized(parsed.data.keywords)
    && (locale !== 'en' || parsed.data.keywords.every(keyword => !containsHan(keyword)))) {
    return false
  }
  const nextKeywords = resolveKeywords({
    existingKeywords: parsed.data.keywords,
    locale: locale === 'en' ? locale : undefined,
    title: parsed.data.title || relativePath,
    relativePath,
    maxItems: options.maxItems,
  })
  const same = Array.isArray(parsed.data.keywords)
    && parsed.data.keywords.length === nextKeywords.length
    && parsed.data.keywords.every((item, index) => String(item).trim() === nextKeywords[index])
  if (!same && options.write) {
    writeMatterFile(filePath, parsed, { ...parsed.data, keywords: nextKeywords })
  }
  return !same
}

const results = []
for (const locale of seoLocales) {
  for (const [kind, rootDir] of [['docs', locale.docsRoot], ['blog', locale.blogRoot]]) {
    const files = walkMarkdownFiles(rootDir)
    results.push({
      scope: `${locale.id}:${kind}`,
      scanned: files.length,
      changed: files.filter(file => normalizeFile(file, rootDir, locale.id)).length,
    })
  }
}
console.table(results)
if (!options.write) {
  console.log('当前为预览模式，添加 --write 才会写入文件。')
}
