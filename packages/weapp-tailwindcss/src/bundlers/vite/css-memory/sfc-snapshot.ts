import type { SfcStyleBlock } from '@/utils/sfc'
import { extractSfcStyleBlocks } from '@/utils/sfc'
import { pruneMapToMaxSize, touchMapEntry } from '../map-cache'

export interface ViteSfcStyleSnapshot {
  readonly source: string
  readonly styles: readonly Readonly<SfcStyleBlock>[]
}

type SourceKind = 'raw' | 'prepared'
type FileSnapshots = Partial<Record<SourceKind, ViteSfcStyleSnapshot>>

/** 仅保存当前文件的扁平样式块，不持有解析期间生成的模板 AST。 */
export function createViteSfcStyleSnapshots(maxFiles: number) {
  const files = new Map<string, FileSnapshots>()
  return {
    resolve(key: string, source: string, kind: SourceKind): ViteSfcStyleSnapshot {
      const previous = files.get(key) ?? {}
      const otherKind = kind === 'raw' ? 'prepared' : 'raw'
      const snapshot = previous[kind]?.source === source
        ? previous[kind]
        : previous[otherKind]?.source === source
          ? previous[otherKind]
          : Object.freeze({
              source,
              styles: Object.freeze(extractSfcStyleBlocks(source, key).map(style => Object.freeze(style))),
            })
      previous[kind] = snapshot
      touchMapEntry(files, key, previous)
      pruneMapToMaxSize(files, maxFiles)
      return snapshot
    },
    delete(key: string) {
      files.delete(key)
    },
    prune(activeKeys: Set<string>) {
      for (const key of files.keys()) {
        if (!activeKeys.has(key)) {
          files.delete(key)
        }
      }
    },
    clear() {
      files.clear()
    },
    getStats() {
      const snapshots = new Set<ViteSfcStyleSnapshot>()
      for (const file of files.values()) {
        if (file.raw) {
          snapshots.add(file.raw)
        }
        if (file.prepared) {
          snapshots.add(file.prepared)
        }
      }
      let sourceCharacters = 0
      let styleCharacters = 0
      for (const snapshot of snapshots) {
        sourceCharacters += snapshot.source.length
        for (const style of snapshot.styles) {
          styleCharacters += style.source.length
        }
      }
      return { files: files.size, snapshots: snapshots.size, sourceCharacters, styleCharacters }
    },
  }
}
