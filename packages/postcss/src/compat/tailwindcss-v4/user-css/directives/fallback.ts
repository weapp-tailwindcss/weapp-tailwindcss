import { stripGeneratorPlaceholderMarkers } from '../markers'

interface TailwindDirectiveOptions {
  importFallback?: boolean | undefined
}

const TAILWIND_EXTRACTABLE_DIRECTIVE_RE = /^\s*@(?:import|use|forward|tailwind|config|source|reference|plugin)\b[\s\S]*?(?:;|$)/
const TAILWIND_EXTRACTABLE_LAYER_STATEMENT_RE = /^\s*@layer\s[^;{]+;\s*$/
const TAILWIND_EXTRACTABLE_BLOCK_START_RE = /^\s*@(?:layer|theme|utility|variant|custom-variant|plugin)\b[\s\S]*\{/

function parseImportRequest(params: string) {
  const match = /^(?:url\(\s*)?(["']?)([^"')\s]+)\1\s*\)?/.exec(params.trim())
  return match?.[2]
}

function parseConfigRequest(params: string) {
  const match = /^(["'])(.+)\1\s*;?$/.exec(params.trim())
  return match?.[2]
}

function isPackageJsonImportRequest(request: string | undefined) {
  return typeof request === 'string' && request.startsWith('#')
}

function isWeappTailwindcssImportRequest(request: string | undefined) {
  return request === 'weapp-tailwindcss' || request?.startsWith('weapp-tailwindcss/')
}

function isTailwindImportRequest(request: string | undefined) {
  return request === 'tailwindcss'
    || request === 'tailwindcss4'
    || request?.startsWith('tailwindcss/')
    || request?.startsWith('tailwindcss4/')
}

function normalizeTailwindImportRequest(request: string | undefined, options: TailwindDirectiveOptions = {}) {
  if (options.importFallback && isWeappTailwindcssImportRequest(request)) {
    return request!.replace(/^weapp-tailwindcss/, 'tailwindcss')
  }
  return request
}

function replaceImportRequest(params: string, request: string, replacement: string) {
  const index = params.indexOf(request)
  if (index === -1) {
    return params
  }
  return `${params.slice(0, index)}${replacement}${params.slice(index + request.length)}`
}

function normalizeTailwindDirectiveLine(line: string, options: TailwindDirectiveOptions = {}) {
  const trimmed = line.trimStart()
  if (/^@(?:use|forward)\b/.test(trimmed)) {
    const request = parseImportRequest(trimmed.replace(/^@(?:use|forward)\b/, ''))
    if (isTailwindImportRequest(request) || (options.importFallback && isWeappTailwindcssImportRequest(request))) {
      const normalizedRequest = normalizeTailwindImportRequest(request, options)
      return replaceImportRequest(line.replace(/^(\s*)@(?:use|forward)\b/, '$1@import'), request!, normalizedRequest!)
    }
    return line
  }
  if (!options.importFallback || !trimmed.startsWith('@import')) {
    return line
  }
  const request = parseImportRequest(trimmed.replace(/^@import\b/, ''))
  if (!request || !isWeappTailwindcssImportRequest(request)) {
    return line
  }
  return replaceImportRequest(line, request, request.replace(/^weapp-tailwindcss/, 'tailwindcss'))
}

export function extractTailwindDirectiveLines(
  rawSource: string,
  options: TailwindDirectiveOptions & { removeConfig?: boolean } = {},
) {
  const directives: string[] = []
  const seenImports = new Set<string>()
  for (const line of stripGeneratorPlaceholderMarkers(rawSource).split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//')) {
      continue
    }
    const directive = TAILWIND_EXTRACTABLE_DIRECTIVE_RE.exec(line)?.[0]
      ?? TAILWIND_EXTRACTABLE_LAYER_STATEMENT_RE.exec(line)?.[0]
    if (!directive) {
      continue
    }
    if (TAILWIND_EXTRACTABLE_BLOCK_START_RE.test(directive)) {
      continue
    }
    const normalized = normalizeTailwindDirectiveLine(directive.trimEnd(), options)
    const normalizedTrimmed = normalized.trim()
    if (options.removeConfig && normalizedTrimmed.startsWith('@config')) {
      continue
    }
    const request = /^@(?:import|use|forward)\b/.test(normalizedTrimmed)
      ? parseImportRequest(normalizedTrimmed.replace(/^@(?:import|use|forward)\b/, ''))
      : undefined
    if (request && !isTailwindImportRequest(request) && !isPackageJsonImportRequest(request)) {
      continue
    }
    if (/^@(?:import|use|forward)\b/.test(normalizedTrimmed) && !request) {
      continue
    }
    if (request && isTailwindImportRequest(request)) {
      const key = normalizedTrimmed
      if (seenImports.has(key)) {
        continue
      }
      seenImports.add(key)
    }
    directives.push(normalized)
  }
  return directives
}

function stripPreprocessorLineComment(line: string) {
  let quote: string | undefined
  let escaped = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = undefined
      }
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '/' && line[index + 1] === '/' && (index === 0 || /\s/.test(line[index - 1]!))) {
      return line.slice(0, index).trimEnd()
    }
  }
  return line
}

function countBlockBraceDelta(line: string) {
  let quote: string | undefined
  let escaped = false
  let delta = 0
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = undefined
      }
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '{') {
      delta++
    }
    else if (char === '}') {
      delta--
    }
  }
  return delta
}

function extractTailwindFallbackBlocks(rawSource: string) {
  const blocks: string[] = []
  let current: string[] | undefined
  let depth = 0

  for (const rawLine of stripGeneratorPlaceholderMarkers(rawSource).split(/\r?\n/)) {
    const line = stripPreprocessorLineComment(rawLine)
    if (!line.trim()) {
      continue
    }

    if (!current) {
      if (!TAILWIND_EXTRACTABLE_BLOCK_START_RE.test(line)) {
        continue
      }
      current = [line]
      depth = countBlockBraceDelta(line)
      if (depth <= 0) {
        blocks.push(current.join('\n'))
        current = undefined
        depth = 0
      }
      continue
    }

    current.push(line)
    depth += countBlockBraceDelta(line)
    if (depth <= 0) {
      blocks.push(current.join('\n'))
      current = undefined
      depth = 0
    }
  }

  return blocks
}

export function extractTailwindSourceForPostcssFallback(
  rawSource: string,
  options: TailwindDirectiveOptions & { removeConfig?: boolean } = {},
) {
  const directives = [
    ...extractTailwindDirectiveLines(rawSource, options),
    ...extractTailwindFallbackBlocks(rawSource),
  ]
  return directives.length > 0 ? directives.join('\n') : undefined
}

export function extractConfigRequestFromSource(rawSource: string) {
  for (const line of rawSource.split(/\r?\n/)) {
    const match = /^\s*@config\b([\s\S]*?)(?:;|$)/.exec(line)
    const request = match ? parseConfigRequest(match[1] ?? '') : undefined
    if (request) {
      return request
    }
  }
  return undefined
}
