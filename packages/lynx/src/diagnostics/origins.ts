import { createHash } from 'node:crypto'
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'
import { isRecord } from './input'

interface Asset {
  name: string
  source: { source: () => string | Uint8Array, map?: () => object | null }
  info?: { related?: { sourceMap?: string | undefined } | undefined } | undefined
}
type GetAsset = (name: string) => { source: { source: () => string | Uint8Array } } | undefined
export interface CssSnapshot {
  identity: string
  contents: Map<string, string[]>
  assets: Array<{ name: string, text: string, map: object | null, mapAsset?: { name: string, text: string } | undefined }>
}
export function cssInputIdentity(css: unknown) {
  if (!isRecord(css)) {
    return undefined
  }
  return createHash('sha256').update(JSON.stringify([css.cssMap, css.cssSource])).digest('hex')
}
function readAssets(chunks: unknown, getAsset?: GetAsset) {
  if (!Array.isArray(chunks)) {
    return []
  }
  return (chunks as Asset[]).map((asset) => {
    const source = asset.source.source()
    let map = asset.source.map?.() ?? null
    let mapAsset: { name: string, text: string } | undefined
    const related = asset.info?.related?.sourceMap
    if (!map && typeof related === 'string') {
      const external = getAsset?.(related)?.source.source()
      if (external !== undefined) {
        const text = typeof external === 'string' ? external : new TextDecoder().decode(external)
        map = JSON.parse(text) as object
        mapAsset = { name: related, text }
      }
    }
    return { name: asset.name, text: typeof source === 'string' ? source : new TextDecoder().decode(source), map: structuredClone(map), mapAsset }
  })
}
/** 保存当前构建图的数据，禁止为诊断重新扫描源码或重复执行 CSS 插件。 */
export function captureCssSnapshot(css: unknown, getAsset?: GetAsset): CssSnapshot | undefined {
  if (!isRecord(css) || !(css.contentMap instanceof Map)) {
    return undefined
  }
  const identity = cssInputIdentity(css)
  if (!identity) {
    return undefined
  }
  try {
    return {
      identity,
      contents: new Map([...css.contentMap].map(([id, segments]) => [String(id), [...segments]])),
      assets: readAssets(css.chunks, getAsset),
    }
  }
  catch {
    return undefined
  }
}
export function snapshotMatches(snapshot: CssSnapshot, css: unknown, chunks: unknown, getAsset?: GetAsset) {
  try {
    return snapshot.identity === cssInputIdentity(css)
      && JSON.stringify(snapshot.assets) === JSON.stringify(readAssets(chunks, getAsset))
  }
  catch {
    return false
  }
}
function offsetOf(text: string, line: number, column: number) {
  const lines = text.split('\n')
  const row = lines[line - 1]
  if (row === undefined || column < 1 || column > row.length + 1) {
    return undefined
  }
  return lines.slice(0, line - 1).reduce((size, value) => size + value.length + 1, 0) + column - 1
}
/** 先撤销 cssId 分段拼接的偏移，唯一绑定 asset 后才消费其 source map。 */
export function mapCssOrigin(snapshot: CssSnapshot | undefined, module: string, line: number | undefined, column: number | undefined) {
  if (!snapshot || !line || !column) {
    return undefined
  }
  const segments = snapshot.contents.get(module)
  if (!segments) {
    return undefined
  }
  const offset = offsetOf(segments.join('\n'), line, column)
  if (offset === undefined) {
    return undefined
  }
  let start = 0
  for (const segment of segments) {
    if (offset >= start && offset < start + segment.length) {
      const matches = snapshot.assets.flatMap((asset) => {
        const index = asset.text.indexOf(segment)
        return index >= 0 && !asset.text.includes(segment, index + 1) ? [{ asset, index }] : []
      })
      if (matches.length !== 1 || !matches[0]?.asset.map) {
        return undefined
      }
      const { asset, index } = matches[0]
      const prefix = asset.text.slice(0, index + offset - start).split('\n')
      try {
        const original = originalPositionFor(new TraceMap(asset.map as ConstructorParameters<typeof TraceMap>[0]), { line: prefix.length, column: prefix.at(-1)!.length })
        return original.source && original.line !== null && original.column !== null
          ? { file: original.source, line: original.line, column: original.column + 1, asset: asset.name }
          : undefined
      }
      catch {
        return undefined
      }
    }
    start += segment.length + 1
  }
  return undefined
}
