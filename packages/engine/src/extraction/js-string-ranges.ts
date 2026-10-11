import type { JsStringStaticRange, SourceSegment } from './types.ts'

function skipQuotedJsContent(content: string, index: number, quote: '"' | '\'' | '`') {
  index++
  while (index < content.length) {
    const char = content[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === quote) {
      return index + 1
    }
    index++
  }
  return index
}

export function createJsStringStaticRanges(content: string) {
  const ranges: JsStringStaticRange[] = []
  let quote: '"' | '\'' | '`' | undefined
  let stringStart = -1
  let templateExpressionDepth = 0

  for (let index = 0; index < content.length; index++) {
    const char = content[index]
    const next = content[index + 1]

    if (quote && char === '\\') {
      index++
      continue
    }

    if (quote === '`' && templateExpressionDepth > 0) {
      if (char === '"' || char === '\'') {
        index = skipQuotedJsContent(content, index, char) - 1
        continue
      }
      if (char === '`') {
        index = skipQuotedJsContent(content, index, '`') - 1
        continue
      }
      if (char === '{') {
        templateExpressionDepth++
        continue
      }
      if (char === '}') {
        templateExpressionDepth--
        continue
      }
      continue
    }

    if (quote) {
      if (quote === '`' && char === '$' && next === '{') {
        ranges.push({ start: stringStart, end: index })
        templateExpressionDepth = 1
        index++
        continue
      }
      if (char === quote) {
        ranges.push({ start: stringStart, end: index })
        quote = undefined
        stringStart = -1
      }
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char
      stringStart = index + 1
    }
  }

  if (quote !== undefined && templateExpressionDepth === 0) {
    ranges.push({ start: stringStart, end: content.length })
  }
  return ranges
}

export function isCandidateInsideJsStringStaticRanges(ranges: JsStringStaticRange[], start: number) {
  let low = 0
  let high = ranges.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const range = ranges[mid]
    if (range === undefined) {
      break
    }
    if (start < range.start) {
      high = mid - 1
      continue
    }
    if (start >= range.end) {
      low = mid + 1
      continue
    }
    return true
  }
  return false
}

export function createJsStringSourceSegments(
  content: string,
  offset: number,
): SourceSegment[] {
  return createJsStringStaticRanges(content)
    .filter(range => range.end > range.start)
    .map(range => ({
      content: content.slice(range.start, range.end),
      start: offset + range.start,
    }))
}
