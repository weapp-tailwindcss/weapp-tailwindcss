import type { TailwindTokenLocation } from '../types.ts'
import path from 'node:path'

export function buildLineOffsets(content: string) {
  const offsets: number[] = [0]
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      offsets.push(i + 1)
    }
  }
  // 追加哨兵，简化二分查找的边界判断。
  if (offsets[offsets.length - 1] !== content.length) {
    offsets.push(content.length)
  }
  return offsets
}

export function resolveLineMeta(content: string, offsets: number[], index: number) {
  let low = 0
  let high = offsets.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const start = offsets[mid]
    if (start === undefined) {
      break
    }
    const nextStart = offsets[mid + 1] ?? content.length

    if (index < start) {
      high = mid - 1
      continue
    }

    if (index >= nextStart) {
      low = mid + 1
      continue
    }

    const line = mid + 1
    const column = index - start + 1
    const lineEnd = content.indexOf('\n', start)
    const lineText = content.slice(start, lineEnd === -1 ? content.length : lineEnd)

    return { line, column, lineText }
  }

  const lastStart = offsets[offsets.length - 2] ?? 0
  return {
    line: offsets.length - 1,
    column: index - lastStart + 1,
    lineText: content.slice(lastStart),
  }
}

export function toExtension(filename: string) {
  const ext = path.extname(filename).replace(/^\./, '')
  return ext || 'txt'
}

export function toRelativeFile(cwd: string, filename: string) {
  // 报告中的相对文件名是逻辑路径，保留跨平台一致的分隔符。
  const relative = path.relative(cwd, filename).replaceAll(path.sep, '/')
  return relative === '' ? path.basename(filename) : relative
}

export function createTokenLocation(input: {
  cwd: string
  file: string
  content: string
  extension: string
  candidate: string
  position: number
  offsets: number[]
}): TailwindTokenLocation {
  const info = resolveLineMeta(input.content, input.offsets, input.position)
  const relativeFile = toRelativeFile(input.cwd, input.file)

  return {
    rawCandidate: input.candidate,
    file: input.file,
    relativeFile,
    extension: input.extension,
    start: input.position,
    end: input.position + input.candidate.length,
    length: input.candidate.length,
    line: info.line,
    column: info.column,
    lineText: info.lineText,
  }
}
