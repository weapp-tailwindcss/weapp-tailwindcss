import type { ChildNode } from 'postcss'
import postcss from 'postcss'
import { isPureLocalCssImportWrapper } from '../../generator-plugin/local-imports'
import { parseCssImportSpecifier, quoteCssImportSpecifier } from '../../syntax/index'
import { parseImportRequest } from '../tailwindcss-v4/user-css/directives'

const MINI_PROGRAM_OUTPUT_IMPORT_RE = /(@import\s+(?:url\(\s*)?)(["'])([^"']+\.(?:wxss|acss|ttss|qss|jxss|tyss)(?:[?#][^"']*)?)\2([^;]*;)/gi
const MINI_PROGRAM_OUTPUT_STYLE_RE = /\.(?:wxss|acss|ttss|qss|jxss|tyss)(?:$|[?#])/i

function normalizeMiniProgramOutputImportRequest(request: string) {
  if (
    request.startsWith('.')
    || request.startsWith('/')
    || /^(?:[a-z][a-z\d+.-]*:|#)/i.test(request)
  ) {
    return request
  }
  return `./${request}`
}

export function normalizeMiniProgramImportShell(css: string, output?: { outputFile: string, outputFiles: Iterable<string>, cssOnly?: boolean }) {
  const normalized = output?.cssOnly
    ? css
    : css.replace(MINI_PROGRAM_OUTPUT_IMPORT_RE, (_match, prefix: string, quote: string, request: string, suffix: string) => {
        return `${prefix}${quote}${normalizeMiniProgramOutputImportRequest(request)}${quote}${suffix}`
      })
  if (!output || !normalized.includes('@import')) {
    return normalized
  }
  // .css 也可能是小程序产物；仅依据当前或已记录的 bundle 身份规范化，不能改写源码包请求。
  const files = new Set([...output.outputFiles].map(normalizeOutputPath))
  const root = postcss.parse(normalized)
  root.walkAtRules('import', (rule) => {
    const parsed = parseCssImportSpecifier(rule.params)
    if (!parsed || (output.cssOnly && !/\.css(?:$|[?#])/i.test(parsed.specifier)) || !files.has(resolveOutputImportRequest(output.outputFile, parsed.specifier))) {
      return
    }
    const request = normalizeMiniProgramOutputImportRequest(parsed.specifier)
    if (request !== parsed.specifier) {
      rule.params = rule.params.replace(parsed.raw, quoteCssImportSpecifier(request, parsed.quote))
    }
  })
  return root.toString()
}

// 此处处理 bundler 产物名和 import 逻辑路径，不接受源码文件系统路径。
function normalizeOutputPath(file: string) {
  const segments: string[] = []
  for (const segment of file.replace(/\\/g, '/').replace(/^\/+/, '').split('/')) {
    if (!segment || segment === '.') {
      continue
    }
    if (segment === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') {
        segments.pop()
      }
      else {
        segments.push(segment)
      }
      continue
    }
    segments.push(segment)
  }
  return segments.join('/')
}

function splitRequestSuffix(request: string) {
  const queryIndex = request.indexOf('?')
  const hashIndex = request.indexOf('#')
  const suffixIndexCandidates = [queryIndex, hashIndex].filter(index => index >= 0)
  const suffixIndex = suffixIndexCandidates.length > 0 ? Math.min(...suffixIndexCandidates) : -1
  return suffixIndex < 0 ? request : request.slice(0, suffixIndex)
}

function resolveOutputImportRequest(file: string, request: string) {
  const cleanRequest = splitRequestSuffix(request.replace(/\\/g, '/'))
  if (cleanRequest.startsWith('/')) {
    return normalizeOutputPath(cleanRequest)
  }
  const normalizedFile = normalizeOutputPath(file)
  const baseDir = normalizedFile.includes('/')
    ? normalizedFile.slice(0, normalizedFile.lastIndexOf('/'))
    : ''
  return normalizeOutputPath(baseDir ? `${baseDir}/${cleanRequest}` : cleanRequest)
}

function isMiniProgramOutputImport(node: ChildNode) {
  if (node.type !== 'atrule' || node.name !== 'import') {
    return false
  }
  const request = parseImportRequest(node.params)
  return request !== undefined
    && MINI_PROGRAM_OUTPUT_STYLE_RE.test(request)
}

function isSelfMiniProgramOutputImport(outputFile: string, node: ChildNode) {
  if (node.type !== 'atrule' || node.name !== 'import') {
    return false
  }
  const request = parseCssImportSpecifier(node.params)?.specifier
  return request !== undefined
    && /\.(?:css|wxss|acss|ttss|qss|jxss|tyss)(?:$|[?#])/i.test(request)
    && resolveOutputImportRequest(outputFile, request) === normalizeOutputPath(outputFile)
}

function removeMiniProgramOutputImportsBy(css: string, predicate: (node: ChildNode) => boolean) {
  if (!css.includes('@import')) {
    return css
  }
  try {
    const root = postcss.parse(css)
    let changed = false
    root.walk((node) => {
      if (predicate(node)) {
        node.remove()
        changed = true
      }
    })
    return changed ? root.toString() : css
  }
  catch {
    return css
  }
}

export function removeSelfMiniProgramOutputImports(css: string, outputFile: string) {
  return removeMiniProgramOutputImportsBy(css, node => isSelfMiniProgramOutputImport(outputFile, node))
}

export function removeMiniProgramOutputImports(css: string) {
  return removeMiniProgramOutputImportsBy(css, isMiniProgramOutputImport)
}

export function normalizeMiniProgramGeneratorCssSource(css: string, outputFile?: string | undefined, outputFiles?: Iterable<string>) {
  const normalized = normalizeMiniProgramImportShell(css, outputFile && outputFiles ? { outputFile, outputFiles } : undefined)
  if (outputFile) {
    return removeSelfMiniProgramOutputImports(normalized, outputFile)
  }
  return isPureLocalCssImportWrapper(normalized)
    ? normalized
    : removeMiniProgramOutputImports(normalized)
}
