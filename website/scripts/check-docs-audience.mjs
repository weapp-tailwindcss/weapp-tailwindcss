import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(scriptDirectory, '..')
const chineseRoot = path.join(websiteRoot, 'docs')
const englishRoot = path.join(websiteRoot, 'i18n', 'en', 'docusaurus-plugin-content-docs', 'current')

export const forbiddenCommandPatterns = [
  {
    name: 'workspace filter command',
    pattern: /\b(?:pnpm|npm|yarn)\s+(?:run\s+)?--filter\b/i,
  },
  {
    name: 'repository e2e command',
    pattern: /\b(?:pnpm|npm|yarn)\s+(?:run\s+)?e2e(?::[\w-]+)*\b/i,
  },
  {
    name: 'repository example package command',
    pattern: /@weapp-tailwindcss\/example-[^\n]*\b(?:test|build)\b/i,
  },
  {
    name: 'repository-only script',
    pattern: /\b(?:pnpm|npm|yarn)\s+(?:run\s+)?(?:build:docs|build:pkg|build:apps|docs:packages:check|run:watch)\b/i,
  },
]

function collectMarkdownFiles(root, current = root) {
  const files = []
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolutePath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(root, absolutePath))
    }
    else if (/\.mdx?$/i.test(entry.name)) {
      files.push(absolutePath)
    }
  }
  return files.sort()
}

export function isMaintainerDocument(source) {
  const lines = source.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return false
  }
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (closingIndex < 0) {
    return false
  }
  const frontmatter = lines.slice(1, closingIndex).join('\n')
  return /^audience:[ \t]*maintainer[ \t]*$/im.test(frontmatter)
}

export function findForbiddenCommands(source) {
  const findings = []
  const lines = source.split(/\r?\n/)
  for (const [lineIndex, line] of lines.entries()) {
    for (const { name, pattern } of forbiddenCommandPatterns) {
      if (pattern.test(line)) {
        findings.push({
          line: lineIndex + 1,
          name,
          text: line.trim().slice(0, 200),
        })
      }
    }
  }
  return findings
}

export function scanDocument(file, root) {
  const source = fs.readFileSync(file, 'utf8')
  if (isMaintainerDocument(source)) {
    return []
  }
  return findForbiddenCommands(source).map(finding => ({
    ...finding,
    file: path.relative(websiteRoot, file).split(path.sep).join('/'),
    root: path.relative(websiteRoot, root).split(path.sep).join('/'),
  }))
}

export function scanDocs({ roots = [chineseRoot, englishRoot] } = {}) {
  return roots.flatMap(root => collectMarkdownFiles(root).flatMap(file => scanDocument(file, root)))
}

export function formatFindings(findings) {
  return findings.map(({ file, line, name, text }) => `${file}:${line}: [${name}] ${text}`).join('\n')
}

export function main() {
  const findings = scanDocs()
  if (findings.length > 0) {
    console.error('面向用户的文档不能包含仓库内部命令：')
    console.error(formatFindings(findings))
    console.error('如确需保留维护命令，请在文档 frontmatter 中声明 audience: maintainer。')
    return 1
  }
  console.log('Docs audience check passed: no repository-only commands in user-facing docs.')
  return 0
}

const currentModule = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === currentModule) {
  process.exitCode = main()
}
