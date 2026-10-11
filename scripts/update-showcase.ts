import type { Dispatcher } from 'undici'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { setDefaultResultOrder } from 'node:dns'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import fs from 'fs-extra'
import { Agent, fetch, ProxyAgent, setGlobalDispatcher } from 'undici'

setDefaultResultOrder('ipv4first')

// ── 模块级正则常量（避免函数内重复编译） ──

/** sanitizeUrl：匹配 http/https 协议前缀 */
const RE_HTTP_PROTOCOL = /^https?:\/\//i

/** stripImages：Markdown 图片语法 */
const RE_MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g
/** stripImages：HTML img 标签 */
const RE_HTML_IMAGE = /<img\b[^>]*>/gi
/** stripImages：img 标签中的 src 属性 */
const RE_IMG_SRC = /src=["']([^"']+)["']/i
/** stripImages：img 标签中的 alt 属性 */
const RE_IMG_ALT = /alt=["']([^"']*)["']/i

/** normalizeLabel - name 类别匹配 */
const RE_LABEL_MINI_PROGRAM_NAME = /小程序名称/
const RE_LABEL_MINI_PROGRAM_NAME2 = /小程序名字/
const RE_LABEL_MINI_PROGRAM_SHORT = /小程序名/
const RE_LABEL_PROJECT_NAME = /项目名称/
const RE_LABEL_PRODUCT_NAME = /产品名称/
const RE_LABEL_PROJECT_SHORT = /项目名/
const RE_LABEL_PRODUCT_NAME_EN = /product\s*name/
const RE_LABEL_PROGRAM_NAME_EN = /program\s*name/
const RE_LABEL_NAME = /^name$/
const RE_LABEL_TITLE = /^title$/
const RE_LABEL_MINI_PROGRAM_EN = /mini\s*program/

/** normalizeLabel - link 类别匹配 */
const RE_LABEL_LINK_ZH = /链接/
const RE_LABEL_LINK_EN = /link/
const RE_LABEL_WEBSITE = /website/
const RE_LABEL_OFFICIAL_SITE = /官网/
const RE_LABEL_ADDRESS = /地址/

/** normalizeLabel - github 类别匹配 */
const RE_LABEL_GITHUB = /github/
const RE_LABEL_GIT = /git/
const RE_LABEL_REPO_ZH = /仓库/
const RE_LABEL_REPO_EN = /repo/

/** normalizeLabel - description 类别匹配 */
const RE_LABEL_INTRO = /介绍/
const RE_LABEL_BRIEF = /简介/
const RE_LABEL_DESC_ZH = /描述/
const RE_LABEL_DESC_EN = /description/
const RE_LABEL_PROJECT_ZH = /项目/
const RE_LABEL_PRODUCT_ZH = /产品/

/** parseDisplayValue：Markdown 链接语法 */
const RE_MARKDOWN_LINK = /\[([^\]]+)\]\(([^)]+)\)/
/** parseDisplayValue：URL 匹配 */
const RE_URL = /https?:\/\/\S+/

/** sanitizeDescriptionContent：Markdown 标题前缀 */
const RE_HEADING_PREFIX = /^#{1,6}\s+/gm

/** parseComment：换行符 */
const RE_NEWLINE = /\r?\n/
/** parseComment：表格行 */
const RE_TABLE_ROW = /^\|/
/** parseComment：分隔线 */
const RE_SEPARATOR = /^-+$/
/** parseComment：列表项前缀 */
const RE_LIST_PREFIX = /^[*-]\s*/
/** parseComment：键值对分隔 */
const RE_KEY_VALUE = /^([^：:]+)[：:](.*)$/

/** slugifySegment：空白字符 */
const RE_WHITESPACE = /\s+/g
/** slugifySegment：非法字符（保留中文、字母、数字、点、连字符） */
const RE_INVALID_SLUG_CHARS = /[^a-z0-9\u4E00-\u9FA5.-]+/gu
/** slugifySegment：连续连字符 */
const RE_MULTIPLE_HYPHENS = /-+/g
/** slugifySegment：首尾连字符 */
const RE_EDGE_HYPHENS = /^-|-$/g

/** resolveImageExtension：文件扩展名 */
const RE_FILE_EXTENSION = /\.([a-z0-9]+)$/i

const execFileAsync = promisify(execFile)

interface GitHubIssue {
  title: string
  html_url: string
  updated_at: string
}

interface GitHubUser {
  login: string
  html_url: string
}

interface GitHubComment {
  id: number
  body: string
  user: GitHubUser
  created_at: string
  html_url: string
}

interface RemoteImage {
  url: string
  alt?: string
}

interface ShowcaseImage {
  alt: string
  src: string
  originUrl: string
  downloaded: boolean
  localPath?: string
  width?: number | null
  height?: number | null
  detectedMiniProgramCode?: boolean
}

interface DisplayValue {
  text: string
  url?: string
}

interface ParsedEntry {
  id: number
  commentUrl: string
  createdAt: string
  author: GitHubUser
  name: string
  link?: DisplayValue
  github?: DisplayValue
  description?: string
  remoteImages: RemoteImage[]
  slugSource: string
}

interface GeneratedEntry extends ParsedEntry {
  order: number
  slug: string
  images: ShowcaseImage[]
}

interface ShowcaseConfigEntry {
  hidden?: boolean
  images?: string[]
}

interface ShowcaseConfig {
  entries?: Record<string, ShowcaseConfigEntry>
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const showcaseDocsPath = path.resolve(repoRoot, 'website/docs/showcase/index.mdx')
const showcaseImageRoot = path.resolve(repoRoot, 'website/static/img/showcase')
const showcaseConfigPath = path.resolve(repoRoot, 'website/docs/showcase/config.json')
const wechatQrScannerPath = path.resolve(repoRoot, 'scripts/scan-wechat-qrcode.py')

const env = process.env as NodeJS.ProcessEnv & {
  SHOWCASE_REPO?: string
  SHOWCASE_ISSUE?: string
  SHOWCASE_IMAGE_TIMEOUT?: string
  SHOWCASE_IMAGE_RETRY?: string
  SHOWCASE_SKIP_IMAGES?: string
  SHOWCASE_PROXY?: string
  HTTPS_PROXY?: string
  HTTP_PROXY?: string
  GITHUB_TOKEN?: string
  GH_TOKEN?: string
}

const repo = env.SHOWCASE_REPO ?? 'weapp-tailwindcss/weapp-tailwindcss'
const issueNumber = Number(env.SHOWCASE_ISSUE ?? '270')

if (Number.isNaN(issueNumber)) {
  throw new TypeError('SHOWCASE_ISSUE must be a valid number')
}

function parseProxyOption(args: string[]): { enabled: boolean, url?: string } {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg) {
      continue
    }

    if (arg === '--no-proxy') {
      return { enabled: false }
    }

    if (arg === '--proxy') {
      const next = args[index + 1]
      if (next && !next.startsWith('-')) {
        return { enabled: true, url: next }
      }
      return { enabled: true }
    }

    if (arg.startsWith('--proxy=')) {
      const url = arg.slice('--proxy='.length).trim()
      return url ? { enabled: true, url } : { enabled: true }
    }
  }

  return { enabled: false }
}

const apiBase = `https://api.github.com/repos/${repo}`
const issueApiUrl = `${apiBase}/issues/${issueNumber}`
const commentsApiUrl = `${issueApiUrl}/comments`
const parsedTimeout = Number(env.SHOWCASE_IMAGE_TIMEOUT ?? '20000')
const imageTimeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 20000
const parsedAttempts = Number(env.SHOWCASE_IMAGE_RETRY ?? '3')
const maxDownloadAttempts = Number.isFinite(parsedAttempts) && parsedAttempts > 0 ? parsedAttempts : 3
const skipImageDownload = /^1|true$/i.test(env.SHOWCASE_SKIP_IMAGES ?? '')
const proxyOption = parseProxyOption(process.argv.slice(2))
const defaultProxyUrl
  = env.SHOWCASE_PROXY
    ?? env.HTTPS_PROXY
    ?? env.HTTP_PROXY
    ?? 'http://127.0.0.1:7890'
const proxyUrl = proxyOption.enabled ? (proxyOption.url?.trim() || defaultProxyUrl) : null
const imageProxyUrl = (env.SHOWCASE_PROXY?.trim() || 'http://127.0.0.1:7890')
const directImageDispatcher = new Agent()
let proxiedImageDispatcher: ProxyAgent | null = null

if (proxyUrl && proxyOption.enabled) {
  try {
    const agent = new ProxyAgent(proxyUrl)
    setGlobalDispatcher(agent)
    console.log(`🌐  GitHub requests will use proxy: ${proxyUrl}`)
  }
  catch (error) {
    console.warn(`⚠️  Failed to configure proxy (${proxyUrl}):`, error)
  }
}

try {
  proxiedImageDispatcher = new ProxyAgent(imageProxyUrl)
}
catch (error) {
  console.warn(`⚠️  Failed to configure image proxy (${imageProxyUrl}):`, error)
}

const token = env.GITHUB_TOKEN ?? env.GH_TOKEN
const baseHeaders: { 'User-Agent': string, 'Authorization'?: string } = {
  'User-Agent': 'weapp-tailwindcss-showcase-script',
}

if (token) {
  baseHeaders.Authorization = `Bearer ${token}`
}

const apiHeaders: Record<string, string> = {
  ...baseHeaders,
  Accept: 'application/vnd.github+json',
}

const mediaHeaders: Record<string, string> = {
  ...baseHeaders,
  Accept: 'image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.8',
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeZone: 'Asia/Shanghai',
})

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Shanghai',
})

async function loadShowcaseConfig(): Promise<ShowcaseConfig> {
  try {
    const raw = await fs.readFile(showcaseConfigPath, 'utf8')
    return JSON.parse(raw) as ShowcaseConfig
  }
  catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      return { entries: {} }
    }
    throw error
  }
}

function matchImageSelector(image: ShowcaseImage, selector: string): boolean {
  const normalized = selector.trim()
  if (!normalized) {
    return false
  }

  if (normalized === image.originUrl || normalized === image.src) {
    return true
  }

  const srcBasename = path.basename(image.src)
  if (normalized === srcBasename) {
    return true
  }

  try {
    const originBasename = path.basename(new URL(image.originUrl).pathname)
    if (normalized === originBasename) {
      return true
    }
  }
  catch (_error) {
    // ignore
  }

  return false
}

function readPngDimensions(buffer: Buffer): { width: number, height: number } | null {
  if (
    buffer.length < 24
    || buffer[0] !== 0x89
    || buffer[1] !== 0x50
    || buffer[2] !== 0x4E
    || buffer[3] !== 0x47
  ) {
    return null
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function readJpegDimensions(buffer: Buffer): { width: number, height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
    return null
  }

  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xFF) {
      offset += 1
      continue
    }

    const marker = buffer[offset + 1]
    if (!marker || marker === 0xD9 || marker === 0xDA) {
      break
    }

    const segmentLength = buffer.readUInt16BE(offset + 2)
    const isSofMarker = marker >= 0xC0
      && marker <= 0xCF
      && marker !== 0xC4
      && marker !== 0xC8
      && marker !== 0xCC

    if (isSofMarker) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      }
    }

    offset += 2 + segmentLength
  }

  return null
}

function getImageDimensions(buffer: Buffer): { width: number, height: number } | null {
  return readPngDimensions(buffer) ?? readJpegDimensions(buffer)
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: apiHeaders })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}\n${body}`)
  }

  return response.json() as Promise<T>
}

async function fetchAllComments(): Promise<GitHubComment[]> {
  const results: GitHubComment[] = []
  let page = 1

  while (true) {
    const url = `${commentsApiUrl}?per_page=100&page=${page}`
    const chunk = await fetchJson<GitHubComment[]>(url)

    if (!Array.isArray(chunk) || chunk.length === 0) {
      break
    }

    results.push(...chunk)

    if (chunk.length < 100) {
      break
    }

    page += 1
  }

  return results
}

function sanitizeUrl(value: string | undefined | null): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!RE_HTTP_PROTOCOL.test(trimmed)) {
    return null
  }

  return trimmed
}

function stripImages(body: string): { text: string, images: RemoteImage[] } {
  const seen = new Set<string>()
  const images: RemoteImage[] = []
  const segments: Array<{ start: number, end: number }> = []

  const markdownImagePattern = new RegExp(RE_MARKDOWN_IMAGE.source, RE_MARKDOWN_IMAGE.flags)
  const htmlImagePattern = new RegExp(RE_HTML_IMAGE.source, RE_HTML_IMAGE.flags)

  for (const match of body.matchAll(markdownImagePattern)) {
    const url = sanitizeUrl(match[2])
    if (!url) {
      continue
    }
    if (!seen.has(url)) {
      const alt = match[1]?.trim()
      images.push(alt ? { url, alt } : { url })
      seen.add(url)
    }
    const start = match.index ?? 0
    segments.push({ start, end: start + match[0].length })
  }

  for (const match of body.matchAll(htmlImagePattern)) {
    const raw = match[0]
    const srcMatch = raw.match(RE_IMG_SRC)
    const url = sanitizeUrl(srcMatch?.[1])
    if (!url) {
      continue
    }
    if (!seen.has(url)) {
      const altMatch = raw.match(RE_IMG_ALT)
      const alt = altMatch?.[1]?.trim()
      images.push(alt ? { url, alt } : { url })
      seen.add(url)
    }
    const start = match.index ?? 0
    segments.push({ start, end: start + raw.length })
  }

  if (!segments.length) {
    return { text: body ?? '', images }
  }

  segments.sort((a, b) => a.start - b.start)

  let lastIndex = 0
  let text = ''
  for (const segment of segments) {
    text += body.slice(lastIndex, segment.start)
    lastIndex = segment.end
  }
  text += body.slice(lastIndex)

  return { text, images }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  dispatcher?: Dispatcher,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      headers,
      signal: controller.signal,
      dispatcher,
    } as RequestInit & { dispatcher?: Dispatcher })
  }
  finally {
    clearTimeout(timeout)
  }
}

async function detectMiniProgramCodeFromFile(filePath: string): Promise<boolean> {
  try {
    const result = await execFileAsync('python3', [
      wechatQrScannerPath,
      filePath,
      '--json',
      '--download-models',
    ], {
      maxBuffer: 1024 * 1024,
    })
    const stdout = result.stdout.trim()
    if (!stdout) {
      return false
    }

    const payload = JSON.parse(stdout) as { detected?: boolean, reason?: string }
    return Boolean(payload.detected)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`⚠️  OpenCV WeChatQRCode 扫描失败，将回退到尺寸判断：${message}`)
    return false
  }
}

function isSquareLike(width: number | null | undefined, height: number | null | undefined): boolean {
  if (!width || !height) {
    return false
  }

  const ratio = width / height
  return ratio >= 0.88 && ratio <= 1.12
}

function isPortraitLike(width: number | null | undefined, height: number | null | undefined): boolean {
  if (!width || !height) {
    return false
  }

  return width / height <= 0.82
}

async function rankShowcaseImagesByMiniProgramCode(
  images: ShowcaseImage[],
  entryTag: string,
): Promise<ShowcaseImage[]> {
  const detectedImages: ShowcaseImage[] = []

  for (const image of images) {
    if (!image.localPath) {
      continue
    }

    image.detectedMiniProgramCode = await detectMiniProgramCodeFromFile(image.localPath)
    if (image.detectedMiniProgramCode) {
      detectedImages.push(image)
    }
  }

  if (detectedImages.length) {
    const detectedSet = new Set(detectedImages)
    const ranked = [
      ...images.filter(image => detectedSet.has(image)),
      ...images.filter(image => !detectedSet.has(image)),
    ]
    if (ranked[0] !== images[0]) {
      console.log(`🔎 ${entryTag} 使用 OpenCV WeChatQRCode 识别小程序码：${path.basename(ranked[0].src)}。`)
    }
    return ranked
  }

  const squareCandidates = images.filter(image => isSquareLike(image.width, image.height))
  const portraitCandidates = images.filter(image => isPortraitLike(image.width, image.height))

  if (squareCandidates.length === 1 && portraitCandidates.length >= 1) {
    const squareCandidate = squareCandidates[0]
    const ranked = [
      squareCandidate,
      ...images.filter(image => image !== squareCandidate),
    ]
    if (ranked[0] !== images[0]) {
      console.log(`🔎 ${entryTag} 未扫描到二维码内容，按唯一方图兜底选择：${path.basename(ranked[0].src)}。`)
    }
    return ranked
  }

  return images
}

function normalizeLabel(label: string): 'name' | 'link' | 'github' | 'description' | null {
  const normalized = label.trim().toLowerCase()
  const presets: Record<'name' | 'link' | 'github' | 'description', RegExp[]> = {
    name: [
      RE_LABEL_MINI_PROGRAM_NAME,
      RE_LABEL_MINI_PROGRAM_NAME2,
      RE_LABEL_MINI_PROGRAM_SHORT,
      RE_LABEL_PROJECT_NAME,
      RE_LABEL_PRODUCT_NAME,
      RE_LABEL_PROJECT_SHORT,
      RE_LABEL_PRODUCT_NAME_EN,
      RE_LABEL_PROGRAM_NAME_EN,
      RE_LABEL_NAME,
      RE_LABEL_TITLE,
      RE_LABEL_MINI_PROGRAM_EN,
    ],
    link: [RE_LABEL_LINK_ZH, RE_LABEL_LINK_EN, RE_LABEL_WEBSITE, RE_LABEL_OFFICIAL_SITE, RE_LABEL_ADDRESS],
    github: [RE_LABEL_GITHUB, RE_LABEL_GIT, RE_LABEL_REPO_ZH, RE_LABEL_REPO_EN],
    description: [RE_LABEL_INTRO, RE_LABEL_BRIEF, RE_LABEL_DESC_ZH, RE_LABEL_DESC_EN, RE_LABEL_PROJECT_ZH, RE_LABEL_PRODUCT_ZH],
  }

  for (const [key, patterns] of Object.entries(presets) as Array<[
    'name' | 'link' | 'github' | 'description',
    RegExp[],
  ]>) {
    if (patterns.some(regex => regex.test(normalized))) {
      return key
    }
  }

  return null
}

function parseDisplayValue(value: string): DisplayValue | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const markdownLinkMatch = trimmed.match(RE_MARKDOWN_LINK)
  if (markdownLinkMatch) {
    const url = sanitizeUrl(markdownLinkMatch[2])
    const urlText = url ?? ''
    const text = markdownLinkMatch[1]?.trim() || urlText || trimmed
    return url ? { text, url } : { text }
  }

  const urlMatch = trimmed.match(RE_URL)
  if (urlMatch) {
    const url = sanitizeUrl(urlMatch[0])
    const text = trimmed.replace(urlMatch[0], '').trim() || urlMatch[0]
    return url ? { text, url } : { text }
  }

  return { text: trimmed }
}

function sanitizeDescriptionContent(value: string): string {
  return value.replace(RE_HEADING_PREFIX, '').trim()
}

function parseComment(comment: GitHubComment): ParsedEntry | null {
  if (!comment.body) {
    return null
  }

  const { text, images } = stripImages(comment.body)
  const lines = text
    .split(RE_NEWLINE)
    .map(line => line.trim())
    .filter(Boolean)

  let name: string | undefined
  let link: DisplayValue | undefined
  let github: DisplayValue | undefined
  let description: string | undefined
  const extra: string[] = []

  for (const originalLine of lines) {
    if (RE_TABLE_ROW.test(originalLine) || RE_SEPARATOR.test(originalLine)) {
      continue
    }

    const line = originalLine.replace(RE_LIST_PREFIX, '').trim()
    const keyValueMatch = line.match(RE_KEY_VALUE)

    if (keyValueMatch) {
      const rawLabel = keyValueMatch[1]?.trim()
      const rawValue = keyValueMatch[2]
      if (!rawLabel || rawValue == null) {
        extra.push(originalLine)
        continue
      }
      const normalized = normalizeLabel(rawLabel)
      const value = rawValue.trim()
      if (normalized === 'name' && !name) {
        name = value
        continue
      }
      if (normalized === 'link' && !link) {
        link = parseDisplayValue(value)
        continue
      }
      if (normalized === 'github' && !github) {
        github = parseDisplayValue(value)
        continue
      }
      if (normalized === 'description' && !description) {
        description = value
        continue
      }
    }

    extra.push(originalLine)
  }

  const descriptionParts: string[] = []
  if (description) {
    descriptionParts.push(description)
  }
  if (extra.length) {
    descriptionParts.push(extra.join('\n\n'))
  }

  const programName = name?.trim()
  if (!programName) {
    console.warn(
      `⚠️  Skipping comment ${comment.html_url} because no 小程序名称 was provided. 请按照模板填写「小程序名称」。`,
    )
    return null
  }

  const normalizedDescription = descriptionParts.length
    ? sanitizeDescriptionContent(descriptionParts.join('\n\n'))
    : ''
  const descriptionText = normalizedDescription || undefined

  const parsedEntry: ParsedEntry = {
    id: comment.id,
    commentUrl: comment.html_url,
    createdAt: comment.created_at,
    author: comment.user,
    name: programName,
    remoteImages: images,
    slugSource: programName,
  }

  if (link) {
    parsedEntry.link = link
  }
  if (github) {
    parsedEntry.github = github
  }
  if (descriptionText) {
    parsedEntry.description = descriptionText
  }

  return parsedEntry
}

function slugifySegment(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(RE_WHITESPACE, '-')
    .replace(RE_INVALID_SLUG_CHARS, '-')
    .replace(RE_MULTIPLE_HYPHENS, '-')
    .replace(RE_EDGE_HYPHENS, '')

  return normalized || fallback
}

function renderJsxValue(value: string | undefined): string {
  return JSON.stringify(value ?? '')
}

function renderDisplayProp(name: string, display?: DisplayValue): string[] {
  if (!display) {
    return []
  }

  const lines = [`  ${name}={{`]
  lines.push(`    text: ${renderJsxValue(display.text)},`)
  if (display.url) {
    lines.push(`    url: ${renderJsxValue(display.url)},`)
  }
  lines.push('  }}')
  return lines
}

function renderImageObject(image: ShowcaseImage, altFallback = ''): string[] {
  return [
    '{',
    `    src: ${renderJsxValue(image.src)},`,
    `    alt: ${renderJsxValue(image.alt || altFallback)},`,
    '  }',
  ]
}

function renderImageArrayProp(name: string, images: ShowcaseImage[], altFallback = ''): string[] {
  const lines = [`  ${name}={[`]
  for (const image of images) {
    lines.push('    {')
    lines.push(`      src: ${renderJsxValue(image.src)},`)
    lines.push(`      alt: ${renderJsxValue(image.alt || altFallback)},`)
    lines.push('    },')
  }
  lines.push('  ]}')
  return lines
}

function renderShowcaseIndexItems(entries: GeneratedEntry[]): string[] {
  const lines = ['  items={[']
  for (const entry of entries) {
    const screenshotsCount = Math.max(entry.images.length - 1, 0)
    lines.push('    {')
    lines.push(`      title: ${renderJsxValue(entry.name)},`)
    lines.push(`      href: ${renderJsxValue(`#${entry.name}`)},`)
    lines.push(`      createdAt: ${renderJsxValue(dateFormatter.format(new Date(entry.createdAt)))},`)
    if (entry.author?.login) {
      lines.push(`      authorLogin: ${renderJsxValue(entry.author.login)},`)
    }
    lines.push(`      screenshotCount: ${screenshotsCount},`)
    lines.push(`      hasLink: ${entry.link?.url ? 'true' : 'false'},`)
    lines.push(`      hasGithub: ${entry.github ? 'true' : 'false'},`)
    lines.push('    },')
  }
  lines.push('  ]}')
  return lines
}

function resolveImageExtension(contentType: string | null, url: string): string {
  const contentMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/avif': 'avif',
  }

  if (contentType) {
    const normalized = contentMap[contentType.toLowerCase()]
    if (normalized) {
      return normalized
    }
  }

  try {
    const { pathname } = new URL(url)
    const extMatch = pathname.match(RE_FILE_EXTENSION)
    if (extMatch) {
      const ext = extMatch[1]
      if (ext) {
        return ext.toLowerCase()
      }
    }
  }
  catch (_error) {
    // ignore parsing errors
  }

  return 'jpg'
}

async function downloadImage(
  image: RemoteImage,
  destDir: string,
  entryDirName: string,
  index: number,
): Promise<ShowcaseImage> {
  const response = await fetchImage(image.url)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const dimensions = getImageDimensions(buffer)
  const ext = resolveImageExtension(response.headers.get('content-type'), image.url)
  const safeAlt = slugifySegment(image.alt ?? `image-${index + 1}`, `image-${index + 1}`)
  const fileName = `${String(index + 1).padStart(2, '0')}-${safeAlt}.${ext}`
  const absolutePath = path.join(destDir, fileName)
  await fs.writeFile(absolutePath, buffer)

  return {
    alt: image.alt?.trim() || '',
    src: `/img/showcase/${entryDirName}/${fileName}`,
    originUrl: image.url,
    downloaded: true,
    localPath: absolutePath,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
  }
}

async function fetchImage(url: string): Promise<Response> {
  if (proxiedImageDispatcher) {
    try {
      return await fetchWithTimeout(url, mediaHeaders, imageTimeoutMs, proxiedImageDispatcher)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`⚠️  Image proxy failed for ${url}, retrying directly: ${message}`)
    }
  }

  return fetchWithTimeout(url, mediaHeaders, imageTimeoutMs, directImageDispatcher)
}

async function downloadImageWithRetry(
  image: RemoteImage,
  destDir: string,
  entryDirName: string,
  index: number,
): Promise<ShowcaseImage | null> {
  for (let attempt = 1; attempt <= maxDownloadAttempts; attempt += 1) {
    try {
      return await downloadImage(image, destDir, entryDirName, index)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(
        `⚠️  Download failed (${attempt}/${maxDownloadAttempts}) for ${image.url}: ${message}`,
      )
      if (attempt >= maxDownloadAttempts) {
        break
      }
      await delay(500 * attempt)
    }
  }

  return null
}

function renderEntry(entry: GeneratedEntry): string {
  const lines: string[] = []
  const titleText = entry.name
  const [primary, ...others] = entry.images

  if (!primary) {
    return ''
  }

  lines.push('<ShowcaseCard')
  lines.push(`  title={${renderJsxValue(titleText)}}`)
  if (entry.link?.url) {
    lines.push(`  titleHref={${renderJsxValue(entry.link.url)}}`)
  }
  if (entry.author?.login && entry.author.html_url) {
    lines.push(`  authorLogin={${renderJsxValue(entry.author.login)}}`)
    lines.push(`  authorUrl={${renderJsxValue(entry.author.html_url)}}`)
  }
  lines.push(`  createdAt={${renderJsxValue(dateFormatter.format(new Date(entry.createdAt)))}}`)
  lines.push(`  commentUrl={${renderJsxValue(entry.commentUrl)}}`)
  lines.push(...renderDisplayProp('link', entry.link))
  lines.push(...renderDisplayProp('github', entry.github))
  lines.push('  primaryImage={{')
  lines.push(...renderImageObject(primary, titleText).slice(1, -1))
  lines.push('  }}')
  lines.push(...renderImageArrayProp('screenshots', others, titleText))

  if (entry.description) {
    lines.push('>')
    lines.push('')
    lines.push(entry.description)
    lines.push('')
    lines.push('</ShowcaseCard>')
    return lines.join('\n')
  }

  lines.push('/>')
  return lines.join('\n')
}

function renderMdx(issue: GitHubIssue, entries: GeneratedEntry[]): string {
  const generatedAt = dateTimeFormatter.format(new Date())
  const header = `<!-- ⚠️ 该文件由 scripts/update-showcase.ts 自动生成。请运行 \`pnpm showcase:update\` 以刷新数据。 -->`
  const frontMatter = [
    '---',
    'title: 优秀案例展示',
    `description: 以下内容来自 ${issue.title}，列表顺序按照提交时间排序。`,
    'keywords:',
    '  - 优秀案例展示',
    '  - showcase',
    '  - weapp-tailwindcss',
    '  - tailwindcss',
    '  - 小程序',
    '  - 微信小程序',
    '  - uni-app',
    '  - taro',
    '  - mpx',
    '---',
  ]
  const intro = [
    `import ShowcaseCard from '@site/src/components/docs/ShowcaseCard'`,
    `import ShowcaseIndex from '@site/src/components/docs/ShowcaseIndex'`,
    '',
    '# 优秀案例展示',
    '',
    `以下内容来自 [${issue.title}](${issue.html_url})，列表顺序按照提交时间排序。`,
    '',
    '<ShowcaseIndex',
    `  issueUrl={${renderJsxValue(issue.html_url)}}`,
    `  generatedAt={${renderJsxValue(generatedAt)}}`,
    ...renderShowcaseIndexItems(entries),
    '/>',
    '',
    '<div className="showcase-grid">',
  ]

  const cards = entries.map(renderEntry)
  const footer = ['</div>', '']

  return [...frontMatter, header, '', ...intro, ...cards, ...footer].join('\n')
}

async function main() {
  console.log(`🔄 Fetching issue #${issueNumber} from ${repo}...`)
  const issue = await fetchJson<GitHubIssue>(issueApiUrl)
  const comments = await fetchAllComments()
  console.log(`📥 Received ${comments.length} comments, parsing entries...`)

  const config = await loadShowcaseConfig()

  const parsed = comments
    .map(comment => parseComment(comment))
    .filter((entry): entry is ParsedEntry => Boolean(entry))

  if (!parsed.length) {
    throw new Error('No valid showcase entries were found in the issue comments.')
  }

  parsed.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  if (!skipImageDownload) {
    await fs.emptyDir(showcaseImageRoot)
  }
  else {
    console.log('⚠️  Skipping local image downloads (SHOWCASE_SKIP_IMAGES=1). Existing assets will be preserved.')
  }

  const generatedEntries: GeneratedEntry[] = []

  for (const [index, entry] of parsed.entries()) {
    const titleText = entry.name
    const slug = slugifySegment(entry.name, `entry-${entry.id}`)
    const dirName = `${String(index + 1).padStart(3, '0')}.${slug}`
    const entryDir = path.join(showcaseImageRoot, dirName)
    const entryTag = `${titleText}（slug: ${slug}）`

    if (!entry.remoteImages.length) {
      console.warn(`⚠️  跳过 ${entryTag}（${entry.commentUrl}），因为没有提供任何图片。`)
      continue
    }

    const allImages: ShowcaseImage[] = []

    if (skipImageDownload) {
      entry.remoteImages.forEach((remote) => {
        allImages.push({
          alt: remote.alt?.trim() || '',
          src: remote.url,
          originUrl: remote.url,
          downloaded: false,
        })
      })
    }
    else {
      await fs.ensureDir(entryDir)
      const downloads = entry.remoteImages.map((image, imgIndex) =>
        downloadImageWithRetry(image, entryDir, dirName, imgIndex),
      )
      const resolved = await Promise.all(downloads)
      resolved.forEach((local, idx) => {
        if (local) {
          allImages.push(local)
          return
        }

        const fallback = entry.remoteImages[idx]
        if (!fallback) {
          return
        }
        allImages.push({
          alt: fallback.alt?.trim() || '',
          src: fallback.url,
          originUrl: fallback.url,
          downloaded: false,
          width: null,
          height: null,
        })
      })
    }

    if (!allImages.length) {
      console.warn(`⚠️  跳过 ${entryTag}（${entry.commentUrl}），因为图片下载失败。`)
      continue
    }

    const configEntry = config.entries?.[slug]
    if (configEntry?.hidden) {
      console.log(`ℹ️  ${entryTag} 已被 config.json 隐藏。`)
      continue
    }

    const manualSelectors = configEntry?.images?.filter(value => value && value.trim())
    let selectedImages: ShowcaseImage[] = []

    if (manualSelectors?.length) {
      const missingSelectors: string[] = []
      selectedImages = manualSelectors
        .map((selector) => {
          const matched = allImages.find(img => matchImageSelector(img, selector))
          if (!matched) {
            missingSelectors.push(selector)
          }
          return matched
        })
        .filter((img): img is ShowcaseImage => Boolean(img))

      if (missingSelectors.length) {
        console.warn(
          `⚠️  ${entryTag} 的 config.json 中部分 images 无法匹配：${missingSelectors.join(', ')}`,
        )
      }
    }
    else {
      selectedImages = allImages
    }

    if (!selectedImages.length) {
      console.warn(`⚠️  ${entryTag} 的图片选择为空，将展示全部图片。`)
      selectedImages = allImages
    }

    if (!manualSelectors?.length) {
      selectedImages = await rankShowcaseImagesByMiniProgramCode(selectedImages, entryTag)
    }

    generatedEntries.push({
      ...entry,
      order: index + 1,
      slug,
      images: selectedImages,
    })
  }

  const mdxContent = renderMdx(issue, generatedEntries)
  await fs.writeFile(showcaseDocsPath, mdxContent, 'utf8')
  console.log(`✅ Showcase updated with ${generatedEntries.length} entries.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
