import { readFileSync } from 'node:fs'
import path from 'node:path'

export function readConfigText(cwd: string, file: string | undefined) {
  if (!file) {
    return undefined
  }
  try {
    return readFileSync(path.join(cwd, file), 'utf8')
  }
  catch {
    return undefined
  }
}

function stripConfigComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(?<!:)\/\/.*$/gmu, '')
}

export function findConfiguredTailwindOwners(cwd: string, files: Array<string | undefined>) {
  const owners = new Set<'vite' | 'postcss'>()
  const evidence: string[] = []
  for (const file of files) {
    const source = readConfigText(cwd, file)
    if (!source) {
      continue
    }
    // 诊断只需要确认配置是否引用了官方生成器；字符串匹配覆盖 import、require
    // 与对象式 PostCSS 配置，同时不会把“仅安装依赖”误判为已注册插件。
    const config = stripConfigComments(source)
    if (/['"]@tailwindcss\/vite['"]/u.test(config)) {
      owners.add('vite')
      evidence.push(file!)
    }
    if (/['"]@tailwindcss\/postcss['"]/u.test(config)) {
      owners.add('postcss')
      evidence.push(file!)
    }
  }
  return { owners, evidence: [...new Set(evidence)] }
}

export function extractConfiguredCssEntries(source: string | undefined) {
  if (!source) {
    return []
  }
  const match = stripConfigComments(source).match(/cssEntries\s*:\s*\[([\s\S]*?)\]/u)
  if (!match?.[1]) {
    return []
  }
  return [...match[1].matchAll(/["']([^"']+\.css)["']/gu)].map(item => item[1]!).filter(Boolean)
}

export function extractConfiguredOption(source: string | undefined, option: string) {
  if (!source) {
    return undefined
  }
  return stripConfigComments(source).match(new RegExp(`\\b${option}\\s*:\\s*["']([^"']+)["']`, 'u'))?.[1]
}

export function extractGeneratorTarget(source: string | undefined) {
  if (!source) {
    return undefined
  }
  const config = stripConfigComments(source)
  const generator = config.match(/generator\s*:\s*\{([\s\S]*?)\}/u)?.[1]
  return extractConfiguredOption(generator, 'target') ?? extractConfiguredOption(config, 'target')
}

export function extractCssSources(source: string) {
  const directives: Array<{ value: string, excluded: boolean, inline: boolean }> = []
  const directiveRe = /@source\s+(?:(not)\s+)?(?:(inline)\s*\(\s*)?["']([^"']*)["']/gu
  for (const match of source.matchAll(directiveRe)) {
    const value = match[3]?.trim()
    if (value) {
      directives.push({ value, excluded: Boolean(match[1]), inline: Boolean(match[2]) })
    }
  }
  return directives
}

export function resolveSourceProbePath(cssFile: string, source: string) {
  const wildcard = source.search(/[!*?[{]/u)
  const prefix = wildcard >= 0 ? source.slice(0, wildcard) : source
  const directory = wildcard >= 0 ? path.dirname(prefix) : prefix
  return path.resolve(path.dirname(cssFile), directory || '.')
}

export const SUPPORTED_APP_TYPES = new Set([
  'uni-app',
  'uni-app-vite',
  'uni-app-x',
  'taro',
  'remax',
  'native',
  'kbone',
  'mpx',
  'weapp-vite',
])

export const SUPPORTED_GENERATOR_TARGETS = new Set(['web', 'weapp', 'app'])
