import type { TailwindSourceEntry } from './types'
import { resolveSourceScanPath, sourcePathApi, toPosixPath } from './paths'

export const DEFAULT_SOURCE_SCAN_EXTENSIONS = [
  'html',
  'wxml',
  'axml',
  'jxml',
  'ksml',
  'ttml',
  'qml',
  'qxml',
  'tyml',
  'xhsml',
  'swan',
  'vue',
  'mpx',
  'js',
  'jsx',
  'ts',
  'tsx',
]

export const FULL_SOURCE_SCAN_EXTENSIONS = [
  'js',
  'jsx',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'mts',
  'cts',
  'vue',
  'uvue',
  'nvue',
  'svelte',
  'mpx',
  'html',
  'wxml',
  'axml',
  'jxml',
  'ksml',
  'ttml',
  'qml',
  'qxml',
  'tyml',
  'xhsml',
  'swan',
  'css',
  'wxss',
  'acss',
  'jxss',
  'ttss',
  'qss',
  'tyss',
  'scss',
  'sass',
  'less',
  'styl',
  'stylus',
]

export function createSourceScanPattern(extensions = DEFAULT_SOURCE_SCAN_EXTENSIONS) {
  return `**/*.{${extensions.join(',')}}`
}

export const FULL_SOURCE_SCAN_PATTERN = createSourceScanPattern(FULL_SOURCE_SCAN_EXTENSIONS)
export const FULL_SOURCE_SCAN_EXTENSION_RE = new RegExp(`\\.(?:${FULL_SOURCE_SCAN_EXTENSIONS.map(extension => extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`)

function expandBracePattern(pattern: string): string[] {
  const index = pattern.indexOf('{')
  if (index === -1) {
    return [pattern]
  }

  const rest = pattern.slice(index)
  let depth = 0
  let endIndex = -1
  for (let i = 0; i < rest.length; i++) {
    const char = rest[i]
    if (char === '\\') {
      i += 1
      continue
    }
    if (char === '{') {
      depth += 1
      continue
    }
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        endIndex = i
        break
      }
    }
  }
  if (endIndex === -1) {
    return [pattern]
  }

  const prefix = pattern.slice(0, index)
  const inner = rest.slice(1, endIndex)
  const suffix = rest.slice(endIndex + 1)
  const parts: string[] = []
  const stack: string[] = []
  let lastPos = 0
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i]
    if (char === '\\') {
      i += 1
      continue
    }
    if (char === '{') {
      stack.push('}')
      continue
    }
    if (char === '}' && stack[stack.length - 1] === '}') {
      stack.pop()
      continue
    }
    if (char === ',' && stack.length === 0) {
      parts.push(inner.slice(lastPos, i))
      lastPos = i + 1
    }
  }
  parts.push(inner.slice(lastPos))

  return parts.flatMap(part =>
    expandBracePattern(`${prefix}${part}${suffix}`))
}

export function expandSourceEntryBraces(sources: TailwindSourceEntry[]): TailwindSourceEntry[] {
  return sources.flatMap((source) => {
    const base = resolveSourceScanPath(source.base)
    const pathApi = sourcePathApi(source.base)
    const relativePattern = pathApi.isAbsolute(source.pattern)
      ? pathApi.relative(source.base, source.pattern)
      : source.pattern
    const pattern = source.base.includes('\\') || /^[a-z]:/i.test(source.base) ? toPosixPath(relativePattern) : relativePattern
    return expandBracePattern(pattern).map(pattern => ({
      base,
      pattern,
      negated: source.negated,
    }))
  })
}
