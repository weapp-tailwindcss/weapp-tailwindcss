import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(currentDirectory, '..')
const defaultChineseRoot = path.join(websiteRoot, 'docs', 'config')
const defaultEnglishRoot = path.join(
  websiteRoot,
  'i18n',
  'en',
  'docusaurus-plugin-content-docs',
  'current',
  'config',
)

const localeMarkers = {
  zh: ['**作用**', '**使用场景**', '**用法**'],
  en: ['**Purpose**', '**When to use**', '**Usage**'],
}

function optionAnchor(name) {
  return name.toLowerCase().replaceAll('.', '-')
}

function readMarkdownFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.mdx?$/i.test(entry.name))
    .map(entry => entry.name)
    .sort()
}

export function extractOptionRows(source) {
  const rows = []
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const separatorIndex = line.startsWith('|') ? line.indexOf('|', 1) : -1
    const firstCell = separatorIndex === -1 ? undefined : line.slice(1, separatorIndex).trim()
    const option = firstCell ? /`([^`]+)`/.exec(firstCell)?.[1] : undefined
    if (!option) {
      continue
    }
    rows.push({
      anchor: optionAnchor(option),
      linkedAnchor: /\]\(#([^)]+)\)/.exec(firstCell)?.[1],
      line: index + 1,
      option,
    })
  }
  return rows
}

export function extractOptionSections(source) {
  const lines = source.split(/\r?\n/)
  const headings = []
  for (const [index, line] of lines.entries()) {
    const match = /^(#{3,4})\s+`([^`]+)`(?:\s+\{#([^}]+)\})?\s*$/.exec(line)
    if (match) {
      headings.push({
        anchor: match[3],
        depth: match[1].length,
        line: index + 1,
        option: match[2],
        start: index,
      })
    }
  }
  return new Map(headings.map((heading, index) => {
    const next = headings.slice(index + 1).find(candidate => candidate.depth <= heading.depth)
    return [heading.option, {
      ...heading,
      source: lines.slice(heading.start + 1, next?.start ?? lines.length).join('\n'),
    }]
  }))
}

export function validateConfigDocument(source, file, locale) {
  const findings = []
  const rows = extractOptionRows(source)
  const sections = extractOptionSections(source)
  const markers = localeMarkers[locale]
  for (const row of rows) {
    if (row.linkedAnchor !== row.anchor) {
      findings.push({
        file,
        line: row.line,
        option: row.option,
        message: `配置表必须链接到 #${row.anchor}`,
      })
    }
    const section = sections.get(row.option)
    if (!section) {
      findings.push({ file, line: row.line, option: row.option, message: '缺少对应的配置详情小节' })
      continue
    }
    if (section.anchor !== row.anchor) {
      findings.push({
        file,
        line: section.line,
        option: row.option,
        message: `详情小节必须声明 {#${row.anchor}}`,
      })
    }
    for (const marker of markers) {
      if (!section.source.includes(marker)) {
        findings.push({ file, line: section.line, option: row.option, message: `详情小节缺少 ${marker}` })
      }
    }
  }
  return { findings, options: rows.map(row => row.option) }
}

export function scanConfigDocs({
  chineseRoot = defaultChineseRoot,
  englishRoot = defaultEnglishRoot,
} = {}) {
  const findings = []
  const chineseFiles = readMarkdownFiles(chineseRoot)
  const englishFiles = readMarkdownFiles(englishRoot)
  const fileNames = [...new Set([...chineseFiles, ...englishFiles])].sort()
  for (const fileName of fileNames) {
    const chineseFile = path.join(chineseRoot, fileName)
    const englishFile = path.join(englishRoot, fileName)
    if (!fs.existsSync(chineseFile) || !fs.existsSync(englishFile)) {
      findings.push({
        file: fileName,
        line: 1,
        option: '*',
        message: fs.existsSync(chineseFile) ? '缺少英文配置页' : '缺少中文配置页',
      })
      continue
    }
    const chinese = validateConfigDocument(fs.readFileSync(chineseFile, 'utf8'), chineseFile, 'zh')
    const english = validateConfigDocument(fs.readFileSync(englishFile, 'utf8'), englishFile, 'en')
    findings.push(...chinese.findings, ...english.findings)
    if (JSON.stringify(chinese.options) !== JSON.stringify(english.options)) {
      findings.push({
        file: fileName,
        line: 1,
        option: '*',
        message: `中英文配置项不一致：zh=[${chinese.options.join(', ')}] en=[${english.options.join(', ')}]`,
      })
    }
  }
  return findings
}

export function formatConfigDocFindings(findings) {
  return findings.map(({ file, line, option, message }) => `${file}:${line}: [${option}] ${message}`).join('\n')
}

export function main() {
  const findings = scanConfigDocs()
  if (findings.length > 0) {
    console.error('框架配置参考缺少完整说明：')
    console.error(formatConfigDocFindings(findings))
    return 1
  }
  console.log('Config reference check passed: Chinese and English option details are complete.')
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main()
}
