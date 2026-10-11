import type {
  InterfaceDeclaration,
  JSDocableNode,
  JSDocTag,
  Symbol as MorphSymbol,
  PropertySignature,
  Signature,
  Type,
  TypeAliasDeclaration,
} from 'ts-morph'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Node, Project, ts } from 'ts-morph'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..', '..')
const apiDir = path.join(repoRoot, 'website', 'docs', 'api')
const apiInterfacesDir = path.join(apiDir, 'interfaces')
const apiOptionsDir = path.join(apiDir, 'options')
const apiOtherInterfacesItemsPath = path.join(apiDir, 'other-interfaces.items.json')
const entryPath = path.join(repoRoot, 'packages', 'weapp-tailwindcss', 'src', 'typedoc.export.ts')
const tsconfigPath = path.join(repoRoot, 'packages', 'weapp-tailwindcss', 'tsconfig.typedoc.json')

function getGitCommitHash(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  }
  catch {
    return 'main'
  }
}

const repoUrl = `https://github.com/weapp-tailwindcss/weapp-tailwindcss/blob/${getGitCommitHash()}/`
const groupSlugMap: Record<string, string> = {
  重要配置: 'important',
  文件匹配: 'matchers',
  生命周期: 'lifecycle',
  一般配置: 'general',
}
const groupEmojiMap: Record<string, string> = {
  重要配置: '✅',
  文件匹配: '🧩',
  生命周期: '🧭',
  一般配置: '⚙️',
}
const otherInterfacesEmoji = '🗂️'
const apiSeoBaseKeywords = [
  'weapp-tailwindcss',
  'API',
  '接口文档',
  '配置项',
  '小程序',
  'tailwindcss',
  '微信小程序',
]

interface JsDocInfo {
  description: string
  tags: Record<string, string[]>
}

interface PropertyDoc {
  name: string
  optional: boolean
  isFunction: boolean
  typeText: string
  source?: string
  description?: string
  tags: Record<string, string[]>
  parameters?: { name: string, typeText: string, optional?: boolean }[]
  returns?: string
  nested?: PropertyDoc[]
  orderKey: number
}

interface InterfaceDoc {
  name: string
  source?: string
  description?: string
  tags: Record<string, string[]>
  kind: 'interface' | 'type'
  typeText?: string
  group?: string
  properties: PropertyDoc[]
}

interface GroupMeta {
  raw: string
  order: number
  title: string
  sidebarLabel: string
  displayTitle: string
  slug: string
}

type ApiDocsDirectory = 'interfaces' | 'options'

export interface TypeRenderContext {
  currentDir?: ApiDocsDirectory
  linkableTypes?: ReadonlySet<string>
}

/** 匹配一个或多个连续空白字符 */
const WHITESPACE_RE = /\s+/g

/** 匹配非 slug 允许字符（小写字母、数字、中文、连字符以外的字符） */
const NON_SLUG_CHARS_RE = /[^a-z0-9\u4E00-\u9FA5-]/g

/** 匹配连续的连字符 */
const CONSECUTIVE_HYPHENS_RE = /-+/g

/** 匹配首尾连字符 */
const LEADING_TRAILING_HYPHENS_RE = /^-|-$/g

/** 匹配字符串开头的连续数字 */
const LEADING_DIGITS_RE = /^(\d+)/

/** 匹配管道符（用于表格单元格转义） */
const PIPE_RE = /\|/g

/** 匹配换行符（CR 或 CRLF） */
const NEWLINE_RE = /\r?\n/g

/** 匹配反引号 */
const BACKTICK_RE = /`/g

/** 匹配空白字符并替换为单个空格 */
const WHITESPACE_COLLAPSE_RE = /\s+/g

/** 匹配可选类型末尾的 undefined 联合 */
const OPTIONAL_UNDEFINED_SUFFIX_RE = /\s*\|\s*undefined$/i

/** 匹配反斜杠 */
const BACKSLASH_RE = /\\/g

/** 匹配分组标题前缀的标点和空白 */
const GROUP_TITLE_PREFIX_RE = /^[.．、\s-]+/

/** 匹配 ts-morph 输出的 import("...").TypeName 类型引用 */
const IMPORT_QUALIFIED_TYPE_RE = /import\((['"])[^'"]+\1\)\.([A-Za-z_$][\w$]*)/g

/** 匹配单一 TypeScript 类型标识符 */
const SINGLE_TYPE_IDENTIFIER_RE = /^[A-Z][\w$]*$/

function isAsciiDigit(value: string): boolean {
  return value >= '0' && value <= '9'
}

function slugifyTitle(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(WHITESPACE_RE, '-')
    .replace(NON_SLUG_CHARS_RE, '')
    .replace(CONSECUTIVE_HYPHENS_RE, '-')
    .replace(LEADING_TRAILING_HYPHENS_RE, '')
  return normalized || 'options'
}

function parseGroupOrder(title: string): { hasNumber: boolean, order: number } {
  const match = title.match(LEADING_DIGITS_RE)
  if (!match) {
    return { hasNumber: false, order: Number.MAX_SAFE_INTEGER }
  }
  return { hasNumber: true, order: Number.parseInt(match[1], 10) }
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, maxLength - 3)}...`
}

function normalizeSeoText(value: string): string {
  return value.replace(WHITESPACE_COLLAPSE_RE, ' ').trim()
}

function normalizeSeoDescription(value: string): string {
  return normalizeSeoText(value.replace(BACKTICK_RE, ''))
}

function uniqKeywords(values: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  values.forEach((item) => {
    const value = normalizeSeoText(item)
    if (!value) {
      return
    }
    const key = value.toLowerCase()
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    normalized.push(value)
  })

  return normalized
}

function buildApiSeoKeywords(...values: Array<string | undefined>): string[] {
  return uniqKeywords([
    ...apiSeoBaseKeywords,
    ...values.filter((value): value is string => Boolean(value)),
  ]).slice(0, 16)
}

function toYamlString(value: string): string {
  return JSON.stringify(value)
}

function pushFrontmatter(
  lines: string[],
  frontmatter: {
    title: string
    sidebarLabel?: string
    sidebarPosition?: number
    description: string
    keywords: string[]
  },
): void {
  lines.push('---')
  lines.push(`title: ${toYamlString(frontmatter.title)}`)
  if (frontmatter.sidebarLabel) {
    lines.push(`sidebar_label: ${toYamlString(frontmatter.sidebarLabel)}`)
  }
  if (typeof frontmatter.sidebarPosition === 'number') {
    lines.push(`sidebar_position: ${frontmatter.sidebarPosition}`)
  }
  lines.push(`description: ${toYamlString(frontmatter.description)}`)
  lines.push('keywords:')
  frontmatter.keywords.forEach((keyword) => {
    lines.push(`  - ${toYamlString(keyword)}`)
  })
  lines.push('---')
  lines.push('')
}

export function buildInterfaceSeoFrontmatter(doc: InterfaceDoc) {
  const fallbackDescription = `${doc.name} 的类型说明，列出公开属性、参数和使用边界。`
  const rawDescription = normalizeSeoDescription(doc.description || '')
  const description = rawDescription.length >= 16 ? rawDescription : fallbackDescription
  return {
    title: doc.name,
    description,
    keywords: buildApiSeoKeywords(doc.name, `${doc.name} 接口`, `${doc.name} 类型定义`, 'TypeScript'),
  }
}

export function buildUserDefinedOptionsOverviewFrontmatter(doc: InterfaceDoc) {
  const description = normalizeSeoText(doc.description || 'UserDefinedOptions 配置总览，按源码分组列出可传入的插件选项。')
  return {
    title: 'UserDefinedOptions',
    sidebarLabel: 'UserDefinedOptions 总览',
    sidebarPosition: 1,
    description,
    keywords: buildApiSeoKeywords('UserDefinedOptions', '配置总览', '插件参数', '选项总览'),
  }
}

export function buildOptionsGroupSeoFrontmatter(meta: GroupMeta, itemCount: number) {
  const description = normalizeSeoText(`${meta.sidebarLabel}：${itemCount} 个 UserDefinedOptions 配置项，包含类型、默认值和源码说明。`)
  return {
    title: meta.displayTitle,
    sidebarLabel: meta.sidebarLabel,
    sidebarPosition: meta.order + 1,
    description,
    keywords: buildApiSeoKeywords(meta.title, meta.sidebarLabel, `${meta.title} 配置`, '插件参数'),
  }
}

export function buildOtherInterfacesSeoFrontmatter(count: number) {
  const description = normalizeSeoText(`其他接口索引，列出 ${count} 个 weapp-tailwindcss 运行时接口和补充类型。`)
  return {
    title: `${otherInterfacesEmoji} 其他接口`,
    sidebarLabel: `${otherInterfacesEmoji} 其他接口`,
    sidebarPosition: 2,
    description,
    keywords: buildApiSeoKeywords('其他接口', '运行时接口', '类型定义', '接口索引'),
  }
}

export function buildApiIndexFrontmatter(hasInterfaces: boolean) {
  const description = normalizeSeoText(`weapp-tailwindcss API 首页，提供配置项分组${hasInterfaces ? '和接口索引' : ''}。`)
  return {
    title: 'weapp-tailwindcss',
    description,
    keywords: buildApiSeoKeywords('API 首页', '配置项索引', '接口索引', '参数说明'),
  }
}

function escapeTableCell(value: string): string {
  return value.replace(PIPE_RE, '&#124;').replace(NEWLINE_RE, '<br/>')
}

function renderInlineCode(value: string): string {
  return `\`${value.replace(BACKTICK_RE, '\\`')}\``
}

export function normalizeTypeReferenceText(value: string): string {
  return value.replace(IMPORT_QUALIFIED_TYPE_RE, '$2')
}

function getApiTypeLink(name: string, currentDir: ApiDocsDirectory): string {
  return currentDir === 'options'
    ? `../interfaces/${name}.md`
    : `./${name}.md`
}

function isLinkableSingleType(typeText: string, linkableTypes?: ReadonlySet<string>): boolean {
  return Boolean(linkableTypes?.has(typeText) && SINGLE_TYPE_IDENTIFIER_RE.test(typeText))
}

export function renderTypeText(value: string, context: TypeRenderContext = {}): string {
  const typeText = normalizeTypeReferenceText(value)
  if (isLinkableSingleType(typeText, context.linkableTypes)) {
    return `[\`${typeText}\`](${getApiTypeLink(typeText, context.currentDir ?? 'interfaces')})`
  }
  return renderInlineCode(typeText)
}

function renderTableCode(value: string): string {
  return `<code>${escapeTableCell(value)}</code>`
}

function renderTableTypeText(value: string, context: TypeRenderContext): string {
  const typeText = normalizeTypeReferenceText(value)
  if (isLinkableSingleType(typeText, context.linkableTypes)) {
    return escapeTableCell(renderTypeText(typeText, context))
  }
  return renderTableCode(typeText)
}

function renderDefaultInline(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return '—'
  }
  if (trimmed.includes('\n') || trimmed.includes('```')) {
    return '详见下方'
  }
  return renderInlineCode(trimmed)
}

function renderDefaultCell(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return '—'
  }
  if (trimmed.includes('\n') || trimmed.includes('```')) {
    return '详见下方'
  }
  return renderTableCode(trimmed)
}

function formatDescriptionCell(prop: PropertyDoc): string {
  const raw = prop.description || prop.tags.remarks?.[0] || ''
  if (!raw) {
    return '—'
  }
  const text = raw.replace(WHITESPACE_COLLAPSE_RE, ' ').trim()
  return escapeTableCell(truncateText(text, 120))
}

function formatTypeText(text: string): string {
  return text.replace(WHITESPACE_COLLAPSE_RE, ' ')
}

function normalizeOptionalType(typeText: string, optional: boolean): string {
  if (!optional) {
    return typeText
  }
  return typeText.replace(OPTIONAL_UNDEFINED_SUFFIX_RE, '')
}

function toPosixPath(p: string): string {
  return p.replace(BACKSLASH_RE, '/')
}

function getDefinitionLink(node: Node): string | undefined {
  const sourceFile = node.getSourceFile()
  const filePath = sourceFile.getFilePath()
  const relPath = toPosixPath(path.relative(repoRoot, filePath))
  const line = node.getStartLineNumber()

  if (sourceFile.isInNodeModules()) {
    return `${relPath}:${line}`
  }
  return `[${relPath}:${line}](${repoUrl}${relPath}#L${line})`
}

function isProjectSourceFile(node: Node): boolean {
  const sourceFile = node.getSourceFile()
  const filePath = sourceFile.getFilePath()
  const relPath = path.relative(repoRoot, filePath)
  return !relPath.startsWith('..') && !path.isAbsolute(relPath) && !sourceFile.isInNodeModules()
}

function readTagText(tag: JSDocTag): string {
  const structuredText = tag.getStructure().text
  if (typeof structuredText === 'string' && structuredText) {
    return structuredText.trim()
  }
  const comment = tag.getComment()
  if (!comment) {
    return ''
  }
  if (Array.isArray(comment)) {
    return comment.map(node => node?.getText() ?? '').join('').trim()
  }
  return comment.toString().trim()
}

function readJsDoc(node: JSDocableNode): JsDocInfo {
  const docs = node.getJsDocs()
  if (!docs.length) {
    return { description: '', tags: {} }
  }
  const doc = docs.at(-1)!
  const description = (doc.getComment() ?? '').toString().trim()
  const tags: Record<string, string[]> = {}
  for (const tag of doc.getTags()) {
    const name = tag.getTagName()
    const value = readTagText(tag)
    if (!value) {
      if (name === 'ignore' || name === 'internal' || name === 'deprecated') {
        tags[name] = ['true']
      }
      continue
    }
    if (!tags[name]) {
      tags[name] = []
    }
    tags[name].push(value)
  }
  return { description, tags }
}

function getPrimaryCallSignature(type: Type): Signature | undefined {
  const signatures = type.getCallSignatures()
  if (signatures.length) {
    return signatures[0]
  }
  const nonNullable = type.getNonNullableType()
  if (nonNullable !== type) {
    const nonNullableSignature = nonNullable.getCallSignatures()[0]
    if (nonNullableSignature) {
      return nonNullableSignature
    }
  }
  for (const unionType of type.getUnionTypes()) {
    const unionSignature = unionType.getCallSignatures()[0]
    if (unionSignature) {
      return unionSignature
    }
  }
  return undefined
}

function scorePropertyDeclaration(decl: PropertySignature): number {
  let score = 0
  if (isProjectSourceFile(decl)) {
    score += 10
  }
  if (decl.getJsDocs().length > 0) {
    score += 5
  }
  return score
}

function pickPropertyDeclaration(symbol: MorphSymbol): PropertySignature | undefined {
  const candidates = symbol.getDeclarations().filter(decl => Node.isPropertySignature(decl)) as PropertySignature[]
  if (!candidates.length) {
    return undefined
  }
  const scored = candidates
    .map(decl => ({
      decl,
      score: scorePropertyDeclaration(decl),
    }))
    .sort((a, b) => b.score - a.score)
  return scored[0]?.decl
}

function isOptionalDeclaration(decl: PropertySignature, symbol: MorphSymbol): boolean {
  if (decl.hasQuestionToken()) {
    return true
  }
  const flags = symbol.getFlags()
  return (flags & ts.SymbolFlags.Optional) !== 0
}

function collectNestedProperties(type: Type): PropertyDoc[] {
  if (!type.isObject() || getPrimaryCallSignature(type)) {
    return []
  }
  if (type.isArray() || type.isReadonlyArray() || type.isTuple()) {
    return []
  }
  const nestedProperties = type.getProperties()
  if (!nestedProperties.length) {
    return []
  }
  const docs: PropertyDoc[] = []
  for (const symbol of nestedProperties) {
    const declaration = pickPropertyDeclaration(symbol)
    if (!declaration) {
      continue
    }
    if (!isProjectSourceFile(declaration)) {
      continue
    }
    if (!Node.isPropertySignature(declaration)) {
      continue
    }
    const name = symbol.getName()
    const optional = isOptionalDeclaration(declaration, symbol)
    const propertyType = symbol.getTypeAtLocation(declaration)
    const jsDoc = readJsDoc(declaration)

    docs.push({
      name,
      optional,
      isFunction: Boolean(getPrimaryCallSignature(propertyType)),
      typeText: normalizeOptionalType(
        formatTypeText(propertyType.getText(declaration)),
        optional,
      ),
      source: getDefinitionLink(declaration),
      description: jsDoc.description || undefined,
      tags: jsDoc.tags,
      orderKey: declaration.getStartLineNumber(),
    })
  }
  return docs.sort((a, b) => a.orderKey - b.orderKey)
}

function buildPropertyDoc(symbol: MorphSymbol): PropertyDoc | undefined {
  const declaration = pickPropertyDeclaration(symbol)
  if (!declaration) {
    return undefined
  }
  const name = symbol.getName()
  const optional = isOptionalDeclaration(declaration, symbol)
  const propertyType = symbol.getTypeAtLocation(declaration)
  const signature = getPrimaryCallSignature(propertyType)
  const isFunction = Boolean(signature)
  const typeText = normalizeOptionalType(
    formatTypeText(propertyType.getText(declaration)),
    optional,
  )
  const jsDoc = readJsDoc(declaration)
  if (jsDoc.tags.ignore || jsDoc.tags.internal || jsDoc.tags.deprecated) {
    return undefined
  }

  const propertyDoc: PropertyDoc = {
    name,
    optional,
    isFunction,
    typeText,
    source: getDefinitionLink(declaration),
    description: jsDoc.description || undefined,
    tags: jsDoc.tags,
    orderKey: declaration.getStartLineNumber(),
  }

  if (signature) {
    propertyDoc.parameters = signature.getParameters().map((param) => {
      const paramType = param.getTypeAtLocation(declaration)
      const paramDecl = param.getDeclarations().find(node => Node.isParameterDeclaration(node))
      const optional = paramDecl && Node.isParameterDeclaration(paramDecl)
        ? paramDecl.isOptional()
        : false
      const rawTypeText = formatTypeText(paramType.getText(declaration))
      return {
        name: param.getName(),
        typeText: optional ? normalizeOptionalType(rawTypeText, true) : rawTypeText,
        optional,
      }
    })
    propertyDoc.returns = formatTypeText(signature.getReturnType().getText(declaration))
  }

  const nested = collectNestedProperties(propertyType)
  if (nested.length > 0) {
    propertyDoc.nested = nested
  }

  return propertyDoc
}

function collectProperties(type: Type): PropertyDoc[] {
  const properties = type.getProperties()
  const docs: PropertyDoc[] = []
  for (const symbol of properties) {
    const propertyDoc = buildPropertyDoc(symbol)
    if (propertyDoc) {
      docs.push(propertyDoc)
    }
  }
  return docs.sort((a, b) => a.orderKey - b.orderKey)
}

function getScalarTypeAliasText(decl: TypeAliasDeclaration): string | undefined {
  const type = decl.getType()
  const members = type.isUnion() ? type.getUnionTypes() : [type]
  const scalarFlags = ts.TypeFlags.String
    | ts.TypeFlags.StringLiteral
    | ts.TypeFlags.Number
    | ts.TypeFlags.NumberLiteral
    | ts.TypeFlags.Boolean
    | ts.TypeFlags.BooleanLiteral
    | ts.TypeFlags.Null
    | ts.TypeFlags.Undefined

  if (!members.every(member => (member.getFlags() & scalarFlags) !== 0)) {
    return undefined
  }
  return formatTypeText(decl.getTypeNodeOrThrow().getText())
}

export function buildInterfaceDoc(name: string, decl: InterfaceDeclaration | TypeAliasDeclaration): InterfaceDoc | undefined {
  const jsDoc = readJsDoc(decl)
  const source = getDefinitionLink(decl)
  const group = jsDoc.tags.group?.[0]
  const type = decl.getType()

  const typeText = Node.isTypeAliasDeclaration(decl)
    ? getScalarTypeAliasText(decl)
    : undefined
  const properties = typeText ? [] : collectProperties(type)
  if (!properties.length && Node.isTypeAliasDeclaration(decl)) {
    return {
      name,
      kind: 'type',
      source,
      description: jsDoc.description || undefined,
      tags: jsDoc.tags,
      group,
      properties: [],
      typeText,
    }
  }

  return {
    name,
    kind: Node.isInterfaceDeclaration(decl) ? 'interface' : 'type',
    source,
    description: jsDoc.description || undefined,
    tags: jsDoc.tags,
    group,
    properties,
    typeText,
  }
}

function pickExportDeclaration(declarations: Node[]): InterfaceDeclaration | TypeAliasDeclaration | undefined {
  const candidates = declarations.filter(decl =>
    Node.isInterfaceDeclaration(decl) || Node.isTypeAliasDeclaration(decl),
  ) as Array<InterfaceDeclaration | TypeAliasDeclaration>
  if (!candidates.length) {
    return undefined
  }
  const local = candidates.find(decl => !decl.getSourceFile().isInNodeModules())
  return local ?? candidates[0]
}

function groupProperties(properties: PropertyDoc[]): Array<{ title: string, items: PropertyDoc[] }> {
  if (!properties.length) {
    return []
  }
  const grouped = new Map<string, PropertyDoc[]>()
  const orderMap = new Map<string, number>()
  for (const prop of properties) {
    const group = prop.tags.group?.[0] ?? '属性'
    if (!grouped.has(group)) {
      grouped.set(group, [])
      orderMap.set(group, orderMap.size)
    }
    grouped.get(group)!.push(prop)
  }
  const result: Array<{ title: string, items: PropertyDoc[] }> = []
  for (const [title, items] of grouped) {
    result.push({
      title,
      items: items.sort((a, b) => a.orderKey - b.orderKey),
    })
  }
  return result.sort((a, b) => {
    const aKey = parseGroupOrder(a.title)
    const bKey = parseGroupOrder(b.title)
    if (aKey.order !== bKey.order) {
      return aKey.order - bKey.order
    }
    if (aKey.hasNumber !== bKey.hasNumber) {
      return aKey.hasNumber ? -1 : 1
    }
    if (a.title !== b.title) {
      return a.title.localeCompare(b.title, 'zh-Hans-CN')
    }
    return (orderMap.get(a.title) ?? 0) - (orderMap.get(b.title) ?? 0)
  })
}

function parseGroupMeta(rawTitle: string): GroupMeta {
  const trimmed = rawTitle.trim()
  let index = 0
  while (index < trimmed.length && isAsciiDigit(trimmed[index])) {
    index += 1
  }
  const hasOrder = index > 0
  const order = hasOrder ? Number.parseInt(trimmed.slice(0, index), 10) : Number.MAX_SAFE_INTEGER
  const rest = trimmed.slice(index).replace(GROUP_TITLE_PREFIX_RE, '').trim()
  const title = rest || trimmed
  const emoji = groupEmojiMap[title] ?? ''
  const displayTitle = emoji ? `${emoji} ${title}` : title
  const sidebarLabel = displayTitle
  const slug = groupSlugMap[title] ?? (Number.isFinite(order) ? `group-${order}` : slugifyTitle(title))
  return {
    raw: rawTitle,
    order,
    title,
    sidebarLabel,
    displayTitle,
    slug,
  }
}

function formatTypeForDisplay(prop: PropertyDoc): string {
  if (prop.isFunction && prop.parameters?.length) {
    const params = prop.parameters
      .map(param => `${param.name}${param.optional ? '?' : ''}: ${param.typeText}`)
      .join(', ')
    const returns = prop.returns ?? 'void'
    return `(${params}) => ${returns}`
  }
  return prop.typeText
}

function renderDefaultValue(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  if (trimmed.includes('```') || trimmed.includes('<br/>') || trimmed.startsWith('`')) {
    return trimmed
  }
  return `\`\`\`ts\n${trimmed}\n\`\`\``
}

function renderPropertyMetaLine(prop: PropertyDoc, context: TypeRenderContext): string {
  const segments: string[] = []
  if (prop.optional) {
    segments.push('可选')
  }
  segments.push(`类型: ${renderTypeText(formatTypeForDisplay(prop), context)}`)
  const defaultValue = prop.tags.default?.join('\n') ?? ''
  if (defaultValue.trim()) {
    segments.push(`默认值: ${renderDefaultInline(defaultValue)}`)
  }
  const since = prop.tags.since?.[0]
  if (since) {
    segments.push(`版本: ${since}`)
  }
  return `> ${segments.join(' | ')}`
}

function toAnchorId(value: string): string {
  return value.toLowerCase()
}

function renderProperty(prop: PropertyDoc, level: number, context: TypeRenderContext): string {
  const lines: string[] = []
  const heading = `${'#'.repeat(level)} ${prop.name}${prop.isFunction ? '()' : ''}${prop.optional ? '?' : ''}`
  lines.push(heading)
  lines.push('')

  const optionalLabel = prop.optional ? '可选 | ' : ''
  lines.push(`> ${optionalLabel}**${prop.name}${prop.isFunction ? '()' : ''}**: ${renderTypeText(prop.typeText, context)}`)
  lines.push('')

  if (prop.description) {
    lines.push(prop.description)
    lines.push('')
  }

  if (prop.tags.since?.length) {
    lines.push(`${'#'.repeat(level + 1)} 添加于`)
    lines.push('')
    lines.push(...prop.tags.since)
    lines.push('')
  }

  if (prop.tags.see?.length) {
    lines.push(`${'#'.repeat(level + 1)} 参阅`)
    lines.push('')
    if (prop.tags.see.length > 1) {
      prop.tags.see.forEach(item => lines.push(`- ${item}`))
    }
    else {
      lines.push(prop.tags.see[0])
    }
    lines.push('')
  }

  if (prop.tags.remarks?.length) {
    lines.push(`${'#'.repeat(level + 1)} 备注`)
    lines.push('')
    lines.push(prop.tags.remarks.join('\n\n'))
    lines.push('')
  }

  if (prop.tags.default?.length) {
    lines.push(`${'#'.repeat(level + 1)} 默认值`)
    lines.push('')
    lines.push(renderDefaultValue(prop.tags.default.join('\n')))
    lines.push('')
  }

  if (prop.tags.example?.length) {
    lines.push(`${'#'.repeat(level + 1)} 示例`)
    lines.push('')
    lines.push(prop.tags.example.join('\n\n'))
    lines.push('')
  }

  if (prop.parameters?.length) {
    lines.push(`${'#'.repeat(level + 1)} 参数`)
    lines.push('')
    prop.parameters.forEach((param) => {
      lines.push(`${'#'.repeat(level + 2)} ${param.name}${param.optional ? '?' : ''}`)
      lines.push('')
      lines.push(renderTypeText(param.typeText, context))
      lines.push('')
    })
  }

  if (prop.returns) {
    lines.push(`${'#'.repeat(level + 1)} 返回`)
    lines.push('')
    lines.push(renderTypeText(prop.returns, context))
    lines.push('')
  }

  if (prop.nested?.length) {
    prop.nested.forEach((nested) => {
      lines.push(renderProperty(nested, level + 1, context))
    })
  }

  return lines.join('\n').trimEnd()
}

function renderOptionsTable(items: PropertyDoc[], context: TypeRenderContext): string[] {
  const lines: string[] = []
  lines.push('| 配置项 | 类型 | 默认值 | 说明 |')
  lines.push('| --- | --- | --- | --- |')
  items.forEach((prop) => {
    const anchor = toAnchorId(prop.name)
    const typeText = formatTypeForDisplay(prop)
    const typeCell = renderTableTypeText(typeText, context)
    const defaultCell = renderDefaultCell(prop.tags.default?.join('\n') ?? '')
    const descriptionCell = formatDescriptionCell(prop)
    lines.push(`| [${prop.name}](#${anchor}) | ${typeCell} | ${defaultCell} | ${descriptionCell} |`)
  })
  return lines
}

function renderOptionsProperty(prop: PropertyDoc, level: number, context: TypeRenderContext): string {
  const lines: string[] = []
  lines.push(`${'#'.repeat(level)} ${prop.name}`)
  lines.push('')
  lines.push(renderPropertyMetaLine(prop, context))
  lines.push('')

  if (prop.description) {
    lines.push(prop.description)
    lines.push('')
  }

  if (prop.tags.see?.length) {
    lines.push(`${'#'.repeat(level + 1)} 参阅`)
    lines.push('')
    if (prop.tags.see.length > 1) {
      prop.tags.see.forEach(item => lines.push(`- ${item}`))
    }
    else {
      lines.push(prop.tags.see[0])
    }
    lines.push('')
  }

  if (prop.tags.remarks?.length) {
    lines.push(`${'#'.repeat(level + 1)} 备注`)
    lines.push('')
    lines.push(prop.tags.remarks.join('\n\n'))
    lines.push('')
  }

  if (prop.tags.default?.length) {
    lines.push(`${'#'.repeat(level + 1)} 默认值`)
    lines.push('')
    lines.push(renderDefaultValue(prop.tags.default.join('\n')))
    lines.push('')
  }

  if (prop.tags.example?.length) {
    lines.push(`${'#'.repeat(level + 1)} 示例`)
    lines.push('')
    lines.push(prop.tags.example.join('\n\n'))
    lines.push('')
  }

  if (prop.parameters?.length) {
    lines.push(`${'#'.repeat(level + 1)} 参数`)
    lines.push('')
    prop.parameters.forEach((param) => {
      lines.push(`${'#'.repeat(level + 2)} ${param.name}${param.optional ? '?' : ''}`)
      lines.push('')
      lines.push(renderTypeText(param.typeText, context))
      lines.push('')
    })
  }

  if (prop.returns) {
    lines.push(`${'#'.repeat(level + 1)} 返回`)
    lines.push('')
    lines.push(renderTypeText(prop.returns, context))
    lines.push('')
  }

  if (prop.name === 'generator') {
    lines.push(`${'#'.repeat(level + 1)} Web 兼容模式`)
    lines.push('')
    lines.push('`generator.webCompat` 用于 Web/H5 与经典 uni-app App WebView 目标下的 Tailwind CSS v4 兼容降级。自动推断 `generator.target: "web"` 时默认开启，uni-app 的 `app` / `app-plus` 构建也会自动启用；如果显式配置了 `generator.target`，则以用户传入的 `webCompat` 为准。')
    lines.push('')
    lines.push('传入 `true` 等价于 `{ preset: "legacy-web" }`，该预设面向 Web Compact 输出，兼容基线为 `Chrome/91.0.4472.114` 与 `AppleWebKit/537.36`。它会移除或降级 `@theme`、`@layer`、`@property`、嵌套规则、`oklch()`、现代颜色函数与相关 `@supports` 包裹，并补充 `-webkit-background-clip: text`，同时保留 Tailwind CSS v4 的运行时间距变量语义。需要保持 Tailwind CSS 官方 Web 输出时，可传入 `false` 或 `{ preset: "off" }`。')
    lines.push('')
    lines.push('```ts')
    lines.push('WeappTailwindcss({')
    lines.push('  generator: {')
    lines.push('    target: "web",')
    lines.push('    webCompat: true,')
    lines.push('  },')
    lines.push('})')
    lines.push('```')
    lines.push('')
  }

  if (prop.nested?.length) {
    prop.nested.forEach((nested) => {
      lines.push(renderOptionsProperty(nested, level + 1, context))
    })
  }

  return lines.join('\n').trimEnd()
}

export function renderInterfaceDoc(doc: InterfaceDoc, context: TypeRenderContext = {}): string {
  const lines: string[] = []
  const renderContext: TypeRenderContext = {
    ...context,
    currentDir: 'interfaces',
  }
  pushFrontmatter(lines, buildInterfaceSeoFrontmatter(doc))
  lines.push(`# ${doc.name}`)
  lines.push('')
  if (doc.description) {
    lines.push(doc.description)
    lines.push('')
  }

  if (doc.tags.since?.length) {
    lines.push('## 添加于')
    lines.push('')
    lines.push(...doc.tags.since)
    lines.push('')
  }

  if (doc.tags.remarks?.length) {
    lines.push('## 备注')
    lines.push('')
    lines.push(doc.tags.remarks.join('\n\n'))
    lines.push('')
  }

  if (doc.tags.see?.length) {
    lines.push('## 参阅')
    lines.push('')
    if (doc.tags.see.length > 1) {
      doc.tags.see.forEach(item => lines.push(`- ${item}`))
    }
    else {
      lines.push(doc.tags.see[0])
    }
    lines.push('')
  }

  if (doc.typeText) {
    lines.push('## 类型')
    lines.push('')
    lines.push('```ts')
    lines.push(`type ${doc.name} = ${doc.typeText}`)
    lines.push('```')
    lines.push('')
  }

  const grouped = groupProperties(doc.properties)
  for (const group of grouped) {
    lines.push(`## ${group.title}`)
    lines.push('')
    group.items.forEach((prop, idx) => {
      lines.push(renderProperty(prop, 3, renderContext))
      if (idx < group.items.length - 1) {
        lines.push('\n***\n')
      }
    })
    lines.push('')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

function renderUserDefinedOptionsOverview(
  doc: InterfaceDoc,
  optionGroups: Array<{ meta: GroupMeta, items: PropertyDoc[] }>,
): string {
  const lines: string[] = []
  pushFrontmatter(lines, buildUserDefinedOptionsOverviewFrontmatter(doc))

  if (doc.description) {
    lines.push(doc.description)
    lines.push('')
  }

  if (optionGroups.length) {
    lines.push('## 分组入口')
    lines.push('')
    optionGroups
      .sort((a, b) => a.meta.order - b.meta.order)
      .forEach((group) => {
        lines.push(`- [${group.meta.displayTitle}](../options/${group.meta.slug}.md) (${group.items.length})`)
      })
    lines.push('')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

function renderOptionsGroupDoc(
  meta: GroupMeta,
  items: PropertyDoc[],
  context: TypeRenderContext = {},
): string {
  const lines: string[] = []
  const renderContext: TypeRenderContext = {
    ...context,
    currentDir: 'options',
  }
  pushFrontmatter(lines, buildOptionsGroupSeoFrontmatter(meta, items.length))

  lines.push(`本页收录 ${items.length} 个配置项，来源于 \`UserDefinedOptions\`。`)
  lines.push('')

  lines.push('## 配置一览')
  lines.push('')
  lines.push(...renderOptionsTable(items, renderContext))
  lines.push('')

  lines.push('## 详细说明')
  lines.push('')
  items.forEach((prop, idx) => {
    lines.push(renderOptionsProperty(prop, 3, renderContext))
    if (idx < items.length - 1) {
      lines.push('')
    }
  })

  return `${lines.join('\n').trimEnd()}\n`
}

function renderOtherInterfacesDoc(docs: InterfaceDoc[]): string {
  const lines: string[] = []
  pushFrontmatter(lines, buildOtherInterfacesSeoFrontmatter(docs.length))

  if (!docs.length) {
    lines.push('暂无其他接口。')
    lines.push('')
    return `${lines.join('\n').trimEnd()}\n`
  }

  lines.push('以下接口用于补充配置或运行时能力，本页面仅提供索引。')
  lines.push('')

  docs
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((doc) => {
      const description = doc.description ? ` - ${doc.description}` : ''
      lines.push(`- [${doc.name}](./interfaces/${doc.name}.md)${description}`)
    })
  lines.push('')

  return `${lines.join('\n').trimEnd()}\n`
}

function writeIndex(
  docs: InterfaceDoc[],
  optionGroups: Array<{ meta: GroupMeta, items: PropertyDoc[] }>,
) {
  const interfaceDocs = docs.filter(doc => !doc.group && doc.name !== 'UserDefinedOptions')
  const lines: string[] = []
  pushFrontmatter(lines, buildApiIndexFrontmatter(interfaceDocs.length > 0))
  lines.push('# weapp-tailwindcss')
  lines.push('')

  if (optionGroups.length) {
    lines.push('## 配置项')
    lines.push('')
    lines.push('- [UserDefinedOptions 总览](interfaces/UserDefinedOptions.md)')
    optionGroups
      .sort((a, b) => a.meta.order - b.meta.order)
      .forEach((group) => {
        lines.push(`- [${group.meta.displayTitle}](options/${group.meta.slug}.md)`)
      })
    lines.push('')
  }

  if (interfaceDocs.length) {
    lines.push('## 接口')
    lines.push('')
    lines.push(`- [${otherInterfacesEmoji} 其他接口](other-interfaces.md)`)
    lines.push('')
  }

  fs.writeFileSync(path.join(apiDir, 'index.md'), `${lines.join('\n').trimEnd()}\n`, 'utf8')
}

function ensureCleanDir(dirPath: string) {
  fs.rmSync(dirPath, { recursive: true, force: true })
  fs.mkdirSync(dirPath, { recursive: true })
}

function run(): void {
  const project = new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: false,
  })
  const entryFile = project.getSourceFileOrThrow(entryPath)
  const exportedDeclarations = entryFile.getExportedDeclarations()

  const interfaceDocs: InterfaceDoc[] = []
  for (const [name, declarations] of exportedDeclarations) {
    const decl = pickExportDeclaration(declarations)
    if (!decl) {
      continue
    }
    const doc = buildInterfaceDoc(name, decl)
    if (doc && !doc.tags.deprecated) {
      interfaceDocs.push(doc)
    }
  }

  const userDefinedOptionsDoc = interfaceDocs.find(doc => doc.name === 'UserDefinedOptions')
  const optionGroups = userDefinedOptionsDoc ? groupProperties(userDefinedOptionsDoc.properties) : []
  const optionGroupMetas = optionGroups.map(group => ({
    meta: parseGroupMeta(group.title),
    items: group.items,
  }))
  const linkableTypes = new Set(interfaceDocs.map(doc => doc.name))

  ensureCleanDir(apiInterfacesDir)
  ensureCleanDir(apiOptionsDir)
  writeIndex(interfaceDocs, optionGroupMetas)

  for (const doc of interfaceDocs) {
    const filePath = path.join(apiInterfacesDir, `${doc.name}.md`)
    if (doc.name === 'UserDefinedOptions') {
      fs.writeFileSync(filePath, renderUserDefinedOptionsOverview(doc, optionGroupMetas), 'utf8')
      continue
    }
    fs.writeFileSync(filePath, renderInterfaceDoc(doc, { linkableTypes }), 'utf8')
  }

  for (const group of optionGroupMetas) {
    const filePath = path.join(apiOptionsDir, `${group.meta.slug}.md`)
    fs.writeFileSync(filePath, renderOptionsGroupDoc(group.meta, group.items, { linkableTypes }), 'utf8')
  }

  const otherInterfaces = interfaceDocs.filter(item => item.name !== 'UserDefinedOptions')
  fs.writeFileSync(
    path.join(apiDir, 'other-interfaces.md'),
    renderOtherInterfacesDoc(otherInterfaces),
    'utf8',
  )
  const otherInterfaceIds = otherInterfaces.map(item => `api/interfaces/${item.name}`)
  fs.writeFileSync(
    apiOtherInterfacesItemsPath,
    `${JSON.stringify(otherInterfaceIds, null, 2)}\n`,
    'utf8',
  )

  console.log(`Generated ${interfaceDocs.length} API docs into ${path.relative(repoRoot, apiDir)}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
}
