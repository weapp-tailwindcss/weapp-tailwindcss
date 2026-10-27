import type { PreparedSourceCandidateFile, ScanSourceCandidateRootOptions, SourceCandidateCollectorSnapshot } from './types-and-cache'
import { LRUCache } from 'lru-cache'
import { forEachSourceCandidateFile, readSourceCandidateFile } from './file-io'
import { createSourceCandidateEligibilityMatcher } from './scan-root'

interface ScanPreparation {
  readonly files: readonly PreparedSourceCandidateFile[]
  readonly matches: (file: string) => boolean
}

// 只共享已复制并冻结的作者扫描数据，不保存任何会话或转换层。
const preparations = new LRUCache<string, ScanPreparation>({ max: 8 })

export function rememberSourceCandidateScanPreparation(
  key: string,
  roots: ScanSourceCandidateRootOptions[],
  eligibleFiles: Iterable<string>,
  snapshot: SourceCandidateCollectorSnapshot,
) {
  const sources = new Map(snapshot.scanSourceById)
  const candidates = new Map(snapshot.scanCandidatesById)
  const files: PreparedSourceCandidateFile[] = []
  for (const id of eligibleFiles) {
    const source = sources.get(id)
    if (source === undefined) {
      return
    }
    files.push(Object.freeze({ id, source, candidates: Object.freeze([...(candidates.get(id) ?? [])]) }))
  }
  const detachedRoots = roots.map(root => ({
    root: root.root,
    outDir: root.outDir,
    explicit: root.explicit,
    entries: root.entries?.map(entry => ({ ...entry })),
  }))
  preparations.set(key, Object.freeze({
    files: Object.freeze(files),
    matches: createSourceCandidateEligibilityMatcher(detachedRoots),
  }))
}

export function invalidateSourceCandidateScanPreparation(key: string | undefined, file?: string) {
  if (file === undefined) {
    if (key) {
      preparations.delete(key)
    }
    return
  }
  for (const [entryKey, preparation] of preparations) {
    if (preparation.matches(file) || preparation.files.some(entry => entry.id === file)) {
      preparations.delete(entryKey)
    }
  }
}

/** 新实例先重新发现文件，再逐一核对作者内容，覆盖未收到 watch 事件的新增、删除及等长修改。 */
export async function readSourceCandidateScanPreparation(key: string, resolveFiles: () => Promise<string[]>) {
  const preparation = preparations.get(key)
  if (!preparation) {
    return undefined
  }
  const files = new Set(await resolveFiles())
  if (files.size !== preparation.files.length || preparation.files.some(file => !files.has(file.id))) {
    preparations.delete(key)
    return undefined
  }
  let matches = true
  await forEachSourceCandidateFile(preparation.files, async (file) => {
    try {
      matches = await readSourceCandidateFile(file.id) === file.source && matches
    }
    catch (error) {
      if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'ENOENT') {
        throw error
      }
      matches = false
    }
  })
  // 已观察到的新来源事件有权撤销正在验证的准备结果。
  if (!matches || preparations.peek(key) !== preparation) {
    if (preparations.peek(key) === preparation) {
      preparations.delete(key)
    }
    return undefined
  }
  return Object.freeze({
    files: preparation.files,
    isCurrent: () => preparations.peek(key) === preparation,
  })
}
