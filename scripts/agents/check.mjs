import { execFileSync } from 'node:child_process'
import { existsSync, globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = file => readFileSync(file, 'utf8')
const nativeCommands = new Set(['install', 'exec', 'pack', 'publish', 'change'])

export function localLinks(markdown) {
  // 规则文档约定使用行内 Markdown 链接；代码块中的示例不是引用。
  const prose = markdown.replace(/^\x60{3}[^\n]*\n[\s\S]*?^\x60{3}\s*$/gm, '')
  return [...prose.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)]
    .map(match => match[1].replace(/^<|>$/g, '').split('#')[0])
    .filter(link => link && !/^[a-z][a-z\d+.-]*:/i.test(link))
}

export function validateCommand(command, cwd, manifests) {
  if (!command.startsWith('pnpm ') || /[<>*$]|\.\.\./.test(command)) {
    return []
  }
  const parts = command.split(/\s+/)
  let manifest = manifests.find(item => item.dir === cwd)
  let index = 1
  if (parts[index] === '--filter') {
    manifest = manifests.find(item => item.name === parts[index + 1])
    index += 2
    if (!manifest) {
      return [`未知 package filter：${command}`]
    }
  }
  if (!manifest) {
    return [`无法确定命令 cwd：${command}`]
  }
  const scriptOnly = parts[index] === 'run'
  if (scriptOnly) {
    index++
  }
  const name = parts[index]
  if (!name || (!Object.hasOwn(manifest.scripts ?? {}, name) && (scriptOnly || !nativeCommands.has(name)))) {
    return [`脚本不存在或缺少 exec：${manifest.name} / ${command}`]
  }
  if (!scriptOnly && name === 'exec' && parts[index + 1] === 'vitest') {
    return parts.slice(index + 2)
      .filter(part => /\.test\.[cm]?[jt]s$/.test(part))
      .filter(part => !existsSync(path.resolve(manifest.dir, part)))
      .map(part => `测试路径不存在：${manifest.name} / ${part}`)
  }
  return []
}

export function validateLesson(markdown, repoRoot) {
  markdown = markdown.replace(/\r\n/g, '\n')
  const errors = []
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!frontmatter) {
    return ['缺少复盘 YAML frontmatter']
  }
  let metadata
  try {
    metadata = parse(frontmatter[1])
  }
  catch (error) {
    return [`复盘 YAML 无效：${error.message}`]
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return ['复盘 frontmatter 必须是对象']
  }
  if (!['verified', 'partial', 'superseded'].includes(metadata.status)) {
    errors.push('复盘 status 无效')
  }
  if (!/^https:\/\//.test(metadata.issue ?? '')) {
    errors.push('复盘缺少 issue 来源')
  }
  if (!/^[a-f\d]{40}$/.test(metadata.baseline ?? '')) {
    errors.push('复盘 baseline 必须是完整 SHA')
  }
  if (!Array.isArray(metadata.regressions) || metadata.regressions.length === 0) {
    errors.push('复盘缺少 regressions')
  }
  else {
    for (const file of metadata.regressions) {
      if (typeof file !== 'string' || path.isAbsolute(file) || path.win32.isAbsolute(file)
        || !/\.test\.(?:[cm]?[jt]s|rb)$/.test(file)
        || !existsSync(path.resolve(repoRoot, file))
        || path.relative(repoRoot, path.resolve(repoRoot, file)).startsWith('..')) {
        errors.push(`复盘回归路径无效：${file}`)
      }
    }
  }
  for (const title of ['症状', '根因与纠正', '验证', '适用边界', '规则评估']) {
    const section = markdown.split(`## ${title}\n`)[1]?.split('\n## ')[0]?.trim()
    if (!section) {
      errors.push(`复盘缺少非空章节：${title}`)
    }
  }
  if (metadata.status === 'superseded' && !metadata.supersededBy) {
    errors.push('已替代复盘必须指定 supersededBy')
  }
  if (metadata.supersededBy && (typeof metadata.supersededBy !== 'string'
    || path.win32.isAbsolute(metadata.supersededBy)
    || !existsSync(path.resolve(repoRoot, metadata.supersededBy))
    || path.relative(repoRoot, path.resolve(repoRoot, metadata.supersededBy)).startsWith('..'))) {
    errors.push('supersededBy 不是仓库内有效引用')
  }
  return errors
}

export function checkRepository(repoRoot = root) {
  repoRoot = path.resolve(repoRoot)
  const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repoRoot })
    .toString()
    .split('\0')
    .filter(Boolean))]
  const rules = files.filter(file => path.basename(file) === 'AGENTS.md')
  const docs = files.filter(file => file.startsWith('docs/engineering/') && file.endsWith('.md'))
  const workspace = parse(read(path.join(repoRoot, 'pnpm-workspace.yaml')))
  const patterns = workspace.packages.filter(pattern => !pattern.startsWith('!')).map(pattern => `${pattern}/package.json`)
  const exclude = workspace.packages.filter(pattern => pattern.startsWith('!')).map(pattern => pattern.slice(1))
  const manifests = ['package.json', ...globSync(patterns, { cwd: repoRoot, exclude })]
    .map(file => ({ ...JSON.parse(read(path.resolve(repoRoot, file))), dir: path.dirname(path.resolve(repoRoot, file)) }))
  const errors = []
  let checkedCommands = 0
  const indexFile = path.resolve(repoRoot, 'docs/engineering/agent-index.md')
  const indexed = existsSync(indexFile) ? localLinks(read(indexFile)).map(link => path.resolve(path.dirname(indexFile), link)) : []
  const rootRule = path.resolve(repoRoot, 'AGENTS.md')
  const routes = existsSync(rootRule) ? localLinks(read(rootRule)).map(link => path.resolve(repoRoot, link)) : []
  for (const file of rules) {
    if (!indexed.includes(path.resolve(repoRoot, file))) {
      errors.push(`规则未登记索引：${file}`)
    }
    if (path.dirname(file) !== '.' && path.dirname(path.dirname(file)) === '.' && !routes.includes(path.resolve(repoRoot, file))) {
      errors.push(`根规则遗漏领域路由：${file}`)
    }
  }
  for (const file of [...rules, ...docs]) {
    const absolute = path.resolve(repoRoot, file)
    if (!existsSync(absolute)) {
      continue
    }
    const markdown = read(absolute)
    for (const link of localLinks(markdown)) {
      try {
        if (!existsSync(path.resolve(path.dirname(absolute), decodeURIComponent(link)))) {
          errors.push(`${file}：链接不存在 ${link}`)
        }
      }
      catch {
        errors.push(`${file}：链接编码无效 ${link}`)
      }
    }
    let cwd = path.dirname(absolute)
    if (markdown.includes('<!-- agents:cwd=root -->')) {
      cwd = repoRoot
    }
    while (!manifests.some(item => item.dir === cwd) && cwd !== path.dirname(cwd)) {
      cwd = path.dirname(cwd)
    }
    const commands = [
      ...[...markdown.matchAll(/\x60(pnpm [^\x60\n]+)\x60/g)].map(match => match[1]),
      ...[...markdown.matchAll(/^pnpm [^\n]+$/gm)].map(match => match[0]),
    ]
    for (const command of commands) {
      checkedCommands++
      errors.push(...validateCommand(command, cwd, manifests).map(error => `${file}：${error}`))
    }
    if (file.startsWith('docs/engineering/lessons/')) {
      errors.push(...validateLesson(markdown, repoRoot).map(error => `${file}：${error}`))
    }
  }
  return { errors, rules: rules.length, documents: docs.length, commands: checkedCommands }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkRepository()
  for (const error of result.errors) {
    console.error(error)
  }
  console.log(`AGENTS: ${result.rules} rules, ${result.documents} documents, ${result.commands} command entries, ${result.errors.length} errors`)
  process.exitCode = result.errors.length ? 1 : 0
}
