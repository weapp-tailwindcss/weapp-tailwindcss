import { deferredCssSourceMarkerRanges, stripDeferredCssSourceMarkers } from './deferred-css-source'

const BUNDLER_GENERATED_CSS_MARKER_RE = /\/\*!?\s*weapp-tailwindcss (?:gulp|vite|webpack)-generated-css(?:\s*:\s*[^\s*]+)?(?:\s+source-hash=[a-f\d]+)?\s*\*\/\s*/i
const BUNDLER_GENERATED_CSS_MARKER_GLOBAL_RE = /\/\*!?\s*weapp-tailwindcss (?:gulp|vite|webpack)-generated-css(?:\s*:\s*[^\s*]+)?(?:\s+source-hash=[a-f\d]+)?\s*\*\/\s*/gi
const BUNDLER_GENERATED_CSS_MARKER_CAPTURE_RE = /\/\*!?\s*weapp-tailwindcss (gulp|vite|webpack)-generated-css(?:\s*:\s*([^\s*]+))?(?:\s+source-hash=([a-f\d]+))?\s*\*\/\s*/gi
const BUNDLER_GENERATED_CSS_END_MARKER_GLOBAL_RE = /\/\*!?\s*weapp-tailwindcss (?:gulp|vite|webpack)-generated-css-end\s*:\s*[^\s*]+\s*\*\/\s*/gi
const VITE_INTERNAL_CSS_MARKER_GLOBAL_RE = /\/\*\$vite\$:\d+\*\/\s*/g

export interface BundlerGeneratedCssMarkerBlock {
  bundler: 'gulp' | 'vite' | 'webpack'
  file?: string | undefined
  sourceHash?: string | undefined
  css: string
}

export function createBundlerGeneratedCssMarker(bundler: 'gulp' | 'vite' | 'webpack', file: string, sourceHash?: string) {
  return `/*! weapp-tailwindcss ${bundler}-generated-css:${encodeURIComponent(file)}${sourceHash ? ` source-hash=${sourceHash}` : ''} */`
}

export function createBundlerGeneratedCssEndMarker(bundler: 'gulp' | 'vite' | 'webpack', file: string) {
  return `/*! weapp-tailwindcss ${bundler}-generated-css-end:${encodeURIComponent(file)} */`
}

export function hasBundlerGeneratedCssMarker(source: unknown) {
  return typeof source === 'string' && BUNDLER_GENERATED_CSS_MARKER_RE.test(source)
}

export function stripBundlerGeneratedCssMarkers(source: string) {
  return stripDeferredCssSourceMarkers(source)
    .replace(BUNDLER_GENERATED_CSS_MARKER_GLOBAL_RE, '')
    .replace(BUNDLER_GENERATED_CSS_END_MARKER_GLOBAL_RE, '')
    .replace(VITE_INTERNAL_CSS_MARKER_GLOBAL_RE, '')
}

/** 所有区间使用原始字符串坐标与右开边界，不能把清理后的偏移用于 source map。 */
export function bundlerGeneratedCssMarkerRanges(source: string) {
  const ranges = [
    ...deferredCssSourceMarkerRanges(source),
    ...[BUNDLER_GENERATED_CSS_MARKER_GLOBAL_RE, BUNDLER_GENERATED_CSS_END_MARKER_GLOBAL_RE, VITE_INTERNAL_CSS_MARKER_GLOBAL_RE]
      .flatMap(pattern => [...source.matchAll(pattern)].map(match => ({ start: match.index!, end: match.index! + match[0].length }))),
  ].sort((a, b) => a.start - b.start)
  const result: typeof ranges = []
  for (const range of ranges) {
    const previous = result.at(-1)
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end)
    }
    else {
      result.push({ ...range })
    }
  }
  return result
}

export function parseBundlerGeneratedCssMarkerBlocks(source: string): BundlerGeneratedCssMarkerBlock[] {
  const blocks: BundlerGeneratedCssMarkerBlock[] = []
  BUNDLER_GENERATED_CSS_MARKER_CAPTURE_RE.lastIndex = 0
  let match = BUNDLER_GENERATED_CSS_MARKER_CAPTURE_RE.exec(source)
  while (match !== null) {
    const cssStart = BUNDLER_GENERATED_CSS_MARKER_CAPTURE_RE.lastIndex
    const nextMatch = BUNDLER_GENERATED_CSS_MARKER_CAPTURE_RE.exec(source)
    const cssEnd = nextMatch?.index ?? source.length
    const file = match[2] ? decodeURIComponent(match[2]) : undefined
    blocks.push({
      bundler: match[1] as 'gulp' | 'vite' | 'webpack',
      file,
      ...(match[3] ? { sourceHash: match[3] } : {}),
      css: source.slice(cssStart, cssEnd),
    })
    match = nextMatch
  }
  return blocks
}

/** 仅替换 transform 阶段标记的模块区间，保留 bundler 合并的前后样式及其层叠顺序。 */
export function replaceViteGeneratedCssModule(source: string, generated: string, matchesSource: (file: string) => boolean) {
  const markers = [...source.matchAll(/\/\*!?\s*weapp-tailwindcss vite-generated-css(-end)?\s*:\s*([^\s*]+)(?:\s+source-hash=[a-f\d]+)?\s*\*\//gi)]
  let cursor = 0
  let result = ''
  let replaced = false
  for (let index = 0; index < markers.length; index++) {
    const start = markers[index]!
    const end = markers[index + 1]
    if (start[1] || !end?.[1] || start[2] !== end[2]) {
      continue
    }
    if (!matchesSource(decodeURIComponent(start[2]!))) {
      continue
    }
    result += source.slice(cursor, start.index) + generated
    cursor = end.index! + end[0].length
    replaced = true
    index++
  }
  return replaced ? result + source.slice(cursor) : undefined
}
