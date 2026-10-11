import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { load } from 'js-yaml'

const docExtensions = ['.md', '.mdx']

const currentDir = path.dirname(fileURLToPath(import.meta.url))

export const repoRoot = path.resolve(currentDir, '..')
export const docsRoot = path.join(repoRoot, 'docs')
export const blogRoot = path.join(repoRoot, 'blog')

const sectionKeywordMap = {
  'quick-start': ['快速开始', '安装', '配置'],
  'issues': ['常见问题', '故障排查', '兼容性'],
  'api': ['API', '接口文档', '配置项'],
  'options': ['配置项', '插件参数', '选项'],
  'ai': ['AI 编程', 'LLM', '工作流'],
  'community': ['社区', '模板', '案例'],
  'migrations': ['迁移', '升级', '兼容'],
  'tailwindcss': ['tailwindcss', '教程', '原子化'],
}

const englishSectionKeywordMap = {
  'quick-start': ['quick start', 'installation', 'configuration'],
  'issues': ['troubleshooting', 'compatibility', 'diagnostics'],
  'api': ['API', 'reference', 'options'],
  'options': ['options', 'plugin options', 'configuration'],
  'ai': ['AI coding', 'LLM', 'workflow'],
  'community': ['community', 'templates', 'case studies'],
  'migrations': ['migration', 'upgrade', 'compatibility'],
  'tailwindcss': ['tailwindcss', 'tutorial', 'utility-first'],
  'tools': ['CLI', 'developer tools', 'build workflow'],
  'uni-app-x': ['uni-app x', 'cross-platform', 'configuration'],
}

const sectionDescriptionMap = {
  'quick-start': '提供安装步骤、配置示例与常见问题排查。',
  'issues': '聚焦兼容性问题、报错现象与修复方案。',
  'api': '包含配置项、接口定义与参数说明。',
  'options': '围绕插件选项给出配置建议与使用边界。',
  'ai': '覆盖 AI 工作流、提示词和工程化实践。',
  'community': '汇总生态插件、模板与实践案例。',
  'migrations': '说明版本升级路径、兼容变更与迁移步骤。',
  'tailwindcss': '聚焦 Tailwind CSS 原理、最佳实践与多端经验。',
  'uni-app-x': '提供 uni-app x 场景的接入步骤与注意事项。',
}

const commonKeywords = [
  'weapp-tailwindcss',
  'tailwindcss',
  '小程序',
  '微信小程序',
  'uni-app',
  'taro',
  'mpx',
]

const englishCommonKeywords = [
  'weapp-tailwindcss',
  'Tailwind CSS 4',
  'cross-platform',
  'mini app',
  'uni-app',
  'Taro',
  'React Native',
  'Lynx',
]

const chineseGeoCommonKeywords = [
  'weapp-tailwindcss',
  'Tailwind CSS 4',
  '跨端',
  '小程序',
  'uni-app',
  'Taro',
  'React Native',
  'Lynx',
]

const localeKeywordOptions = {
  'en': {
    commonKeywords: englishCommonKeywords,
    sectionKeywordMap: englishSectionKeywordMap,
  },
  'zh-cn': {
    commonKeywords: chineseGeoCommonKeywords,
    sectionKeywordMap,
  },
}

const keywordStopwords = new Set([
  'index',
  'readme',
  'doc',
  'docs',
  'blog',
  'md',
  'mdx',
])

const keywordNoisePatterns = [
  /^\d+(?:\.\d+)*$/,
  /^[_-]+$/,
]

/** 匹配 import 语句行 */
const IMPORT_LINE_RE = /^import\s.+$/gm

/** 匹配 export 语句行 */
const EXPORT_LINE_RE = /^export\s.+$/gm

/** 匹配代码块（三反引号包裹） */
const CODE_BLOCK_RE = /```[\s\S]*?```/g

/** 匹配行内代码（单反引号包裹） */
const INLINE_CODE_RE = /`([^`]+)`/g

/** 匹配 Markdown 图片语法 */
const MD_IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g

/** 匹配 Markdown 链接语法（保留文本） */
const MD_LINK_RE = /\[([^\]]+)\]\([^)]*\)/g

/** 匹配 HTML 标签 */
const HTML_TAG_RE = /<[^>]+>/g

/** 匹配 Docusaurus 容器语法（::: 包裹） */
const ADMONITION_RE = /:::[\s\S]*?:::/g

/** 匹配一个或多个连续空白字符 */
const WHITESPACE_COLLAPSE_RE = /\s+/g

/** 匹配关键词分隔符（中英文逗号、顿号、竖线、斜杠） */
const KEYWORD_SEPARATOR_RE = /[，,、|/]/

/** 匹配单个小写字母 */
const SINGLE_LOWERCASE_RE = /^[a-z]$/

/** 匹配 Unicode 字母、数字及常见符号的连续序列 */
const TITLE_TOKEN_RE = /[\p{L}\p{N}#+.-]+/gu

/** 匹配反斜杠 */
const BACKSLASH_RE = /\\/g

/** 匹配 .md 或 .mdx 文件扩展名（不区分大小写） */
const MD_MDX_EXTENSION_RE = /\.(md|mdx)$/i

/** 匹配连字符和下划线（用于路径段转空格） */
const HYPHEN_UNDERSCORE_RE = /[-_]/g

/** 匹配路径末尾的 /index */
const TRAILING_INDEX_RE = /\/index$/

/** 匹配完整的 index 字符串 */
const EXACT_INDEX_RE = /^index$/

/** 匹配博客文件名中的日期前缀（YYYY-MM-DD-） */
const BLOG_DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/

/** 匹配 frontmatter 首行的键值对格式 */
const FRONTMATTER_KEY_RE = /^[A-Z_][\w-]*\s*:/i

/** 匹配汉字，防止中文关键词进入英文公开资产 */
const HAN_RE = /\p{Script=Han}/u

export function containsHan(value) {
  return HAN_RE.test(String(value))
}

export function walkMarkdownFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return []
  }
  const files = []
  const stack = [rootDir]
  while (stack.length) {
    const current = stack.pop()
    if (!current) {
      continue
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(abs)
        continue
      }
      if (entry.name.startsWith('_')) {
        continue
      }
      if (docExtensions.includes(path.extname(entry.name))) {
        files.push(abs)
      }
    }
  }
  return files.sort()
}

export function extractFirstHeading(content) {
  for (const line of content.split('\n')) {
    if (!line.startsWith('#')) {
      continue
    }
    const heading = line.slice(1).trimStart()
    if (heading) {
      return heading
    }
  }
  return ''
}

function stripMarkdown(content) {
  return content
    .replace(IMPORT_LINE_RE, '')
    .replace(EXPORT_LINE_RE, '')
    .replace(CODE_BLOCK_RE, ' ')
    .replace(INLINE_CODE_RE, '$1')
    .replace(MD_IMAGE_RE, ' ')
    .replace(MD_LINK_RE, '$1')
    .replace(HTML_TAG_RE, ' ')
    .replace(ADMONITION_RE, ' ')
}

export function extractDescription(content, maxLength = 140) {
  const lines = stripMarkdown(content)
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)

  const candidate = lines.find((line) => {
    if (line.startsWith('#')) {
      return false
    }
    if (line.startsWith('>') || line.startsWith('-') || line.startsWith('*') || line.startsWith('|')) {
      return false
    }
    return line.length >= 12
  }) || ''

  const normalized = candidate.replace(WHITESPACE_COLLAPSE_RE, ' ').trim()
  if (!normalized) {
    return ''
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

function normalizeKeywordValue(value) {
  if (!value) {
    return []
  }
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean)
  }
  return String(value)
    .split(KEYWORD_SEPARATOR_RE)
    .map(item => item.trim())
    .filter(Boolean)
}

function isKeywordNoise(value) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return true
  }
  if (keywordStopwords.has(normalized)) {
    return true
  }
  if (SINGLE_LOWERCASE_RE.test(normalized)) {
    return true
  }
  return keywordNoisePatterns.some(pattern => pattern.test(normalized))
}

export function normalizeKeywords(input, options = {}) {
  const maxItems = options.maxItems ?? 16
  const values = normalizeKeywordValue(input)
  const seen = new Set()
  const normalized = []

  for (const rawValue of values) {
    const value = rawValue.trim()
    if (!value || isKeywordNoise(value)) {
      continue
    }
    const key = value.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    normalized.push(value)
  }

  return normalized.slice(0, maxItems)
}

function toTitleKeywords(title) {
  return (title.match(TITLE_TOKEN_RE) || [])
    .map(item => item.trim())
    .filter(item => item.length >= 2)
}

export function resolveKeywords(params) {
  const localeOptions = localeKeywordOptions[params.locale]
  const relativePath = params.relativePath.replace(BACKSLASH_RE, '/')
  const firstSection = relativePath.split('/')[0] || ''
  const sectionKeywords = (params.sectionKeywordMap ?? localeOptions?.sectionKeywordMap ?? sectionKeywordMap)[firstSection] || []
  const pathKeywords = relativePath
    .replace(MD_MDX_EXTENSION_RE, '')
    .split('/')
    .map(item => item.replace(HYPHEN_UNDERSCORE_RE, ' ').trim())
    .filter(item => item.length >= 2)

  const merged = [
    ...normalizeKeywordValue(params.existingKeywords),
    ...sectionKeywords,
    ...toTitleKeywords(params.title),
    ...pathKeywords,
    ...(params.commonKeywords ?? localeOptions?.commonKeywords ?? commonKeywords),
  ]
  const localeSafeKeywords = params.locale === 'en'
    ? merged.filter(keyword => !containsHan(keyword))
    : merged
  return normalizeKeywords(localeSafeKeywords, {
    maxItems: params.maxItems ?? 16,
  })
}

export function buildFallbackDescription(title, relativePath) {
  const normalizedTitle = String(title || '文档').trim() || '文档'
  const normalizedPath = String(relativePath || '').replace(BACKSLASH_RE, '/')
  const firstSection = normalizedPath.split('/')[0] || ''
  const suffix = sectionDescriptionMap[firstSection] || '提供核心概念、配置说明与实践示例。'
  return `${normalizedTitle}，${suffix}`
}

export function toDocRoute(relativePath, slug) {
  if (typeof slug === 'string' && slug.trim()) {
    const normalizedSlug = slug.startsWith('/') ? slug : `/${slug}`
    if (normalizedSlug.startsWith('/docs')) {
      return normalizedSlug
    }
    return `/docs${normalizedSlug}`
  }
  const normalized = relativePath.replace(BACKSLASH_RE, '/').replace(MD_MDX_EXTENSION_RE, '')
  if (normalized === 'index' || normalized.endsWith('/index')) {
    const withoutIndex = normalized.replace(TRAILING_INDEX_RE, '').replace(EXACT_INDEX_RE, '')
    return withoutIndex ? `/docs/${withoutIndex}` : '/docs'
  }
  return `/docs/${normalized}`
}

export function toBlogRoute(relativePath, slug) {
  if (typeof slug === 'string' && slug.trim()) {
    const normalizedSlug = slug.startsWith('/') ? slug : `/${slug}`
    if (normalizedSlug.startsWith('/blog')) {
      return normalizedSlug
    }
    return `/blog${normalizedSlug}`
  }
  const normalized = relativePath.replace(BACKSLASH_RE, '/').replace(MD_MDX_EXTENSION_RE, '')
  const raw = normalized.split('/').pop() || normalized
  const stripped = raw.replace(BLOG_DATE_PREFIX_RE, '')
  return `/blog/${stripped}`
}

export function readMatterFile(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8')
  const lines = raw.split('\n')
  const firstLine = lines[0]?.trim() || ''
  if (firstLine && !raw.startsWith('---\n') && FRONTMATTER_KEY_RE.test(firstLine)) {
    let endIndex = 0
    while (endIndex < lines.length && lines[endIndex].trim() !== '') {
      endIndex += 1
    }
    const yamlBlock = lines.slice(0, endIndex).join('\n')
    try {
      const data = load(yamlBlock)
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const contentStart = endIndex < lines.length ? endIndex + 1 : endIndex
        return {
          raw,
          parsed: {
            data,
            content: lines.slice(contentStart).join('\n'),
          },
        }
      }
    }
    catch {
    }
  }
  return {
    raw,
    parsed: matter(raw),
  }
}

export function writeMatterFile(absPath, parsed, data) {
  const next = matter.stringify(parsed.content, data, {
    lineWidth: 120,
  })
  fs.writeFileSync(absPath, next, 'utf8')
}
