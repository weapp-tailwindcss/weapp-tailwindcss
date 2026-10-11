import path from 'node:path'
import { normalizeKeywords, readMatterFile, walkMarkdownFiles } from './seo-shared.mjs'

const genericDescriptionPatterns = [
  '相关文档，覆盖安装、配置与常见问题。',
  'Related documentation covering installation, configuration, and common issues.',
]

const invalidDescriptionPatterns = [
  /^\s*(?:[-*+]|\d+[.)])\s/,
  /^\s*(?:```|`|import\s|export\s|function\s|const\s|let\s|var\s)/,
  /(?:https?:\/\/|www\.)/i,
  /(?:\*\*|__|\[[^\]]+\]\(|<\/?[a-z][^>]*>)/i,
  /(?:├──|└──|│)/,
  /[{};]\s*$/,
]

/** 匹配关键词分隔符（中英文逗号、顿号、竖线、斜杠） */
const KEYWORD_SEPARATOR_RE = /[，,、|/]/g

/** 匹配反斜杠 */
const BACKSLASH_RE = /\\/g

function toKeywordArray(keywords) {
  if (Array.isArray(keywords)) {
    return keywords.map(item => String(item).trim()).filter(Boolean)
  }
  if (typeof keywords === 'string' && keywords.trim()) {
    return keywords.split(KEYWORD_SEPARATOR_RE).map(item => item.trim()).filter(Boolean)
  }
  return []
}

export function isKeywordsNormalized(keywords) {
  const original = toKeywordArray(keywords)
  const normalized = normalizeKeywords(original)
  if (original.length !== normalized.length) {
    return false
  }
  return original.every((item, index) => item === normalized[index])
}

export function isDescriptionValid(description) {
  return typeof description === 'string'
    && description.trim().length >= 16
    && !genericDescriptionPatterns.some(pattern => description.includes(pattern))
    && !invalidDescriptionPatterns.some(pattern => pattern.test(description.trim()))
}

export function buildFileIssues(parsedData, relativePath) {
  const issues = []
  const description = typeof parsedData.description === 'string' ? parsedData.description.trim() : ''
  const keywords = toKeywordArray(parsedData.keywords)

  for (const pattern of genericDescriptionPatterns) {
    if (description.includes(pattern)) {
      issues.push({
        type: 'generic_description',
        file: relativePath,
        message: 'description 使用了通用模板文案',
      })
      break
    }
  }

  if (!description || description.length < 16) {
    issues.push({
      type: 'weak_description',
      file: relativePath,
      message: 'description 过短或缺失关键信息',
    })
  }

  if (description && invalidDescriptionPatterns.some(pattern => pattern.test(description))) {
    issues.push({
      type: 'invalid_description',
      file: relativePath,
      message: 'description 包含列表、代码、URL、Markdown 或残句',
    })
  }

  if (keywords.length < 8) {
    issues.push({
      type: 'few_keywords',
      file: relativePath,
      message: `keywords 数量偏少（${keywords.length}）`,
    })
  }

  if (!isKeywordsNormalized(parsedData.keywords)) {
    issues.push({
      type: 'non_normalized_keywords',
      file: relativePath,
      message: 'keywords 包含噪声词或重复词，请运行 seo:keywords:normalize',
    })
  }

  return issues
}

function createCoverageStats() {
  return {
    total: 0,
    withTitle: 0,
    withDescription: 0,
    withKeywords: 0,
  }
}

export function scanSeoQuality(rootDir, label) {
  const files = walkMarkdownFiles(rootDir)
  const issues = []
  const coverage = createCoverageStats()

  for (const absPath of files) {
    const { parsed } = readMatterFile(absPath)
    const relativePath = path.relative(rootDir, absPath).replace(BACKSLASH_RE, '/')

    coverage.total += 1
    if (typeof parsed.data.title === 'string' && parsed.data.title.trim()) {
      coverage.withTitle += 1
    }
    if (typeof parsed.data.description === 'string' && parsed.data.description.trim()) {
      coverage.withDescription += 1
    }
    if (toKeywordArray(parsed.data.keywords).length > 0) {
      coverage.withKeywords += 1
    }

    issues.push(
      ...buildFileIssues(parsed.data, relativePath).map(issue => ({
        ...issue,
        scope: label,
      })),
    )
  }

  return {
    label,
    files,
    issues,
    coverage,
  }
}

export function summarizeByType(issues) {
  return issues.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1
    return acc
  }, /** @type {Record<string, number>} */ ({}))
}

export function toCoverageRatio(coverage) {
  const total = coverage.total || 1
  return {
    title: coverage.withTitle / total,
    description: coverage.withDescription / total,
    keywords: coverage.withKeywords / total,
  }
}
