import type { ProjectEntry } from './shared'
import path from 'node:path'

export interface ProjectCssSnapshotFile {
  cssFile: string
  snapshotName: string
}

const CSS_SNAPSHOT_OUTPUT_PREFIXES = [
  'unpackage/dist/dev/mp-weixin/',
  'dist/build/mp-weixin/',
  'dist/dev/mp-weixin/',
  'dist/wx/',
  'dist/',
]

export function getProjectCssFiles(entry: ProjectEntry): string[] {
  const files = entry.cssFiles?.length ? entry.cssFiles : [entry.cssFile]
  return Array.from(new Set(files))
}

export function getProjectCssSnapshotFiles(entry: ProjectEntry): ProjectCssSnapshotFile[] {
  return getProjectCssFiles(entry).map((cssFile) => {
    // 快照名是逻辑产物标识；文件读取仍使用原始文件系统路径。
    const normalized = cssFile.replace(/\\/g, '/')
    if (cssFile === entry.cssFile) {
      return { cssFile, snapshotName: path.posix.basename(normalized) }
    }
    const stripped = CSS_SNAPSHOT_OUTPUT_PREFIXES.reduce((current, prefix) => {
      return current.startsWith(prefix) ? current.slice(prefix.length) : current
    }, normalized)
    return { cssFile, snapshotName: stripped || path.posix.basename(normalized) }
  })
}
