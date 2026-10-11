import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(currentDir, '..')
const chineseRoot = path.join(websiteRoot, 'docs')
const englishRoot = path.join(websiteRoot, 'i18n', 'en', 'docusaurus-plugin-content-docs', 'current')
const englishI18nRoot = path.join(websiteRoot, 'i18n', 'en')
const englishBlogRoot = path.join(englishI18nRoot, 'docusaurus-plugin-content-blog')
const markdownExtension = /\.mdx?$/i
const chineseTextCharacter = /[\u3000-\u303F\u3400-\u9FFF\uF900-\uFAFF\uFE10-\uFE1F\uFF01-\uFF60]/
const unsupportedTailwindVersion = /Tailwind\s*CSS\s*(?:@|v)?[23]\b/i
const retiredDocs = [
  'community/typography.md',
  'issues/v1.md',
  'migrations/v1.md',
  'migrations/v2.md',
  'principle/index.md',
  'quick-start/build-or-import-outside-components.md',
  'quick-start/frameworks/uni-app.mdx',
  'quick-start/v2/index.mdx',
  'quick-start/v4/UniAppHbuilderShared.mdx',
  'quick-start/v4/UniappCliStyle.mdx',
  'quick-start/v4/UniappHbuilderStyle.mdx',
  'quick-start/v4/mpx.mdx',
  'quick-start/v4/readme.md',
  'quick-start/v4/taro-vite.mdx',
  'quick-start/v4/taro-webpack.mdx',
  'quick-start/v4/uni-app-vite-hbuilder.mdx',
  'quick-start/v4/uni-app-vite.mdx',
  'quick-start/v4/uni-app-webpack.mdx',
  'quick-start/v4/uni-app-x.mdx',
  'quick-start/v4/weapp-vite.mdx',
  'releases/v2.md',
  'tailwindcss-maintenance-book.md',
  'upgrade/uni-app.md',
]

function collectMarkdownFiles(root, current = root) {
  const files = []
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolutePath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(root, absolutePath))
    }
    else if (markdownExtension.test(entry.name)) {
      files.push(path.relative(root, absolutePath).split(path.sep).join('/'))
    }
  }
  return files.sort()
}

function collectFiles(root, predicate, current = root) {
  const files = []
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolutePath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectFiles(root, predicate, absolutePath))
    }
    else if (predicate(entry.name)) {
      files.push(path.relative(root, absolutePath))
    }
  }
  return files.sort()
}

function findChineseTextLines(value, relativePath) {
  return value
    .split(/\r?\n/)
    .flatMap((line, index) => chineseTextCharacter.test(line) ? [`${relativePath}:${index + 1}: ${line.trim()}`] : [])
}

function collectJsonOutputStrings(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach(item => collectJsonOutputStrings(item, output))
    return output
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      output.push(value)
    }
    return output
  }

  if (typeof value.message === 'string' && typeof value.description === 'string') {
    output.push(value.message)
    return output
  }

  Object.values(value).forEach(item => collectJsonOutputStrings(item, output))
  return output
}

function findJsonChineseTextValues(file) {
  const raw = fs.readFileSync(file, 'utf8')
  const parsed = JSON.parse(raw)
  const lines = raw.split(/\r?\n/)
  return collectJsonOutputStrings(parsed).flatMap((value) => {
    if (!chineseTextCharacter.test(value)) {
      return []
    }
    const serializedValue = JSON.stringify(value)
    const lineIndex = lines.findIndex(line => line.includes(serializedValue))
    const relativePath = path.relative(websiteRoot, file).split(path.sep).join('/')
    return [`${relativePath}:${lineIndex >= 0 ? lineIndex + 1 : 1}: ${value}`]
  })
}

const chineseFiles = collectMarkdownFiles(chineseRoot)
const englishFiles = collectMarkdownFiles(englishRoot)
const chineseSet = new Set(chineseFiles)
const englishSet = new Set(englishFiles)
const missing = chineseFiles.filter(file => !englishSet.has(file))
const extra = englishFiles.filter(file => !chineseSet.has(file))
function visibleContent(value) {
  return value
    .replace(/^---\n(?:.*\n)*?---\s*/m, '')
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/https?:\/\/[^\s)>]+/g, '')
}

const englishMarkdownFiles = [
  ...englishFiles.map(file => path.join(englishRoot, file)),
  ...collectMarkdownFiles(englishBlogRoot).map(file => path.join(englishBlogRoot, file)),
  ...collectFiles(englishBlogRoot, name => /\.ya?ml$/i.test(name)).map(file => path.join(englishBlogRoot, file)),
]
const englishTextIssues = englishMarkdownFiles.flatMap((file) => {
  const relativePath = path.relative(websiteRoot, file).split(path.sep).join('/')
  return findChineseTextLines(fs.readFileSync(file, 'utf8'), relativePath)
})
const englishJsonIssues = collectFiles(englishI18nRoot, name => name.endsWith('.json'))
  .flatMap(file => findJsonChineseTextValues(path.join(englishI18nRoot, file)))
const unsupportedVersionDocs = [
  ...chineseFiles.map(file => ({ file, root: chineseRoot, locale: 'Chinese' })),
  ...englishFiles.map(file => ({ file, root: englishRoot, locale: 'English' })),
].filter(({ file, root }) => {
  return unsupportedTailwindVersion.test(visibleContent(fs.readFileSync(path.join(root, file), 'utf8')))
})
const retiredDocsPresent = [
  ...retiredDocs.map(file => ({ file, root: chineseRoot, locale: 'Chinese' })),
  ...retiredDocs.map(file => ({ file, root: englishRoot, locale: 'English' })),
].filter(({ file, root }) => fs.existsSync(path.join(root, file)))

if (missing.length || extra.length || englishTextIssues.length || englishJsonIssues.length || unsupportedVersionDocs.length || retiredDocsPresent.length) {
  if (missing.length) {
    console.error(`Missing English docs:\n${missing.join('\n')}`)
  }
  if (extra.length) {
    console.error(`English docs without a Chinese source:\n${extra.join('\n')}`)
  }
  if (englishTextIssues.length) {
    console.error(`English Markdown containing Chinese text or punctuation:\n${englishTextIssues.join('\n')}`)
  }
  if (englishJsonIssues.length) {
    console.error(`English JSON output values containing Chinese text or punctuation:\n${englishJsonIssues.join('\n')}`)
  }
  if (unsupportedVersionDocs.length) {
    console.error(`Current docs referencing unsupported Tailwind CSS versions:\n${unsupportedVersionDocs.map(({ file, locale }) => `${locale}: ${file}`).join('\n')}`)
  }
  if (retiredDocsPresent.length) {
    console.error(`Retired docs must not be restored:\n${retiredDocsPresent.map(({ file, locale }) => `${locale}: ${file}`).join('\n')}`)
  }
  process.exitCode = 1
}
else {
  console.log(`Docs localization is complete: ${chineseFiles.length} Chinese/English file pairs.`)
}
