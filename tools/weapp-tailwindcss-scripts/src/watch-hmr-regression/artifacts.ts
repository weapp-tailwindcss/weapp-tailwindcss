import type { Buffer } from 'node:buffer'
import type {
  ClassMutationMetrics,
  IconifyHotUpdateMetrics,
  MainStyleHotUpdateMetrics,
  StyleMutationMetrics,
  SubPackageMutationMetrics,
  UserReportedHotUpdateMetrics,
  WatchArtifactDiff,
  WatchArtifactDiffEntry,
  WatchArtifactEntry,
  WatchArtifactSnapshot,
  WatchCase,
  WatchCaseArtifacts,
} from './types'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { collectImportedStyleFiles } from './artifacts/imports'
import { expandOutputFileEntries } from './mutations/shared'

const TEXT_ARTIFACT_RE = /\.(?:acss|css|html|js|json|jsx|map|qml|qs|qss|sjs|ttml|ttss|txml|wxml|wxs|wxss|xml)$/i
const MAX_INLINE_TEXT_BYTES = 200 * 1024
const DIFF_CONTEXT_LINES = 2
const HMR_ARTIFACT_COUNT = 5

function sha256(content: Buffer | string) {
  return createHash('sha256').update(content).digest('hex')
}

function normalizeOutputPath(root: string, file: string) {
  const relative = path.relative(root, file)
  return (relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : file).replace(/\\/g, '/')
}

function addOutputFile(files: Set<string>, file: string | undefined) {
  if (!file || /[\0?#]/.test(file)) {
    return
  }
  files.add(file)
}

export async function collectWatchArtifactFiles(watchCase: WatchCase) {
  const candidates = new Set<string>()
  addOutputFile(candidates, watchCase.outputWxml)
  addOutputFile(candidates, watchCase.outputJs)
  for (const file of watchCase.outputStyleCandidates) {
    addOutputFile(candidates, file)
  }
  for (const file of watchCase.globalStyleCandidates) {
    addOutputFile(candidates, file)
  }
  for (const guard of watchCase.outputIntegrityGuards ?? []) {
    addOutputFile(candidates, guard.file)
  }
  for (const mutation of watchCase.subPackageMutations ?? []) {
    addOutputFile(candidates, mutation.outputWxml)
    addOutputFile(candidates, mutation.outputJs)
    for (const file of mutation.outputStyleCandidates) {
      addOutputFile(candidates, file)
    }
    for (const file of mutation.globalStyleCandidates) {
      addOutputFile(candidates, file)
    }
  }
  const expanded = await expandOutputFileEntries([...candidates])
  return collectImportedStyleFiles(expanded)
}

async function collectArtifactEntry(root: string, file: string): Promise<WatchArtifactEntry> {
  const label = normalizeOutputPath(root, file)
  let buffer: Buffer
  try {
    buffer = await fs.readFile(file)
  }
  catch {
    return {
      file: label,
      absoluteFile: file,
      exists: false,
      size: 0,
    }
  }

  const text = TEXT_ARTIFACT_RE.test(file)
  const entry: WatchArtifactEntry = {
    file: label,
    absoluteFile: file,
    exists: true,
    size: buffer.byteLength,
    sha256: sha256(buffer),
    kind: text ? 'text' : 'binary',
  }
  if (!text) {
    entry.contentOmittedReason = 'binary'
  }
  else if (buffer.byteLength > MAX_INLINE_TEXT_BYTES) {
    entry.contentOmittedReason = 'large-text'
  }
  else {
    entry.content = buffer.toString('utf8')
  }
  return entry
}

export async function collectWatchArtifactSnapshot(
  watchCase: WatchCase,
  phase: WatchArtifactSnapshot['phase'],
  options: {
    capturedAfterHmrCount?: number
    requestedHmrCount?: number
  } = {},
): Promise<WatchArtifactSnapshot> {
  const files = await collectWatchArtifactFiles(watchCase)
  return {
    phase,
    capturedAt: new Date().toISOString(),
    ...(options.requestedHmrCount == null ? {} : { requestedHmrCount: options.requestedHmrCount }),
    ...(options.capturedAfterHmrCount == null ? {} : { capturedAfterHmrCount: options.capturedAfterHmrCount }),
    files: await Promise.all(files.map(file => collectArtifactEntry(watchCase.cwd, file))),
  }
}

function createTextDiff(file: string, before: string, after: string) {
  if (before === after) {
    return ''
  }
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const max = Math.max(beforeLines.length, afterLines.length)
  const changed = new Set<number>()
  for (let index = 0; index < max; index += 1) {
    if (beforeLines[index] !== afterLines[index]) {
      for (let cursor = Math.max(0, index - DIFF_CONTEXT_LINES); cursor <= Math.min(max - 1, index + DIFF_CONTEXT_LINES); cursor += 1) {
        changed.add(cursor)
      }
    }
  }
  const lines = [`diff -- ${file}`]
  let last = -2
  for (const index of [...changed].sort((a, b) => a - b)) {
    if (index > last + 1) {
      lines.push('@@')
    }
    const beforeLine = beforeLines[index]
    const afterLine = afterLines[index]
    if (beforeLine === afterLine) {
      lines.push(` ${beforeLine ?? ''}`)
    }
    else {
      if (beforeLine !== undefined) {
        lines.push(`-${beforeLine}`)
      }
      if (afterLine !== undefined) {
        lines.push(`+${afterLine}`)
      }
    }
    last = index
  }
  return `${lines.join('\n')}\n`
}

export function diffWatchArtifactSnapshots(
  dev: WatchArtifactSnapshot,
  hmr: WatchArtifactSnapshot,
  requestedHmrCount = HMR_ARTIFACT_COUNT,
  capturedAfterHmrCount = hmr.capturedAfterHmrCount ?? 0,
): WatchArtifactDiff {
  const beforeByFile = new Map(dev.files.map(file => [file.file, file]))
  const afterByFile = new Map(hmr.files.map(file => [file.file, file]))
  const files = [...new Set([...beforeByFile.keys(), ...afterByFile.keys()])].sort()
  const entries: WatchArtifactDiffEntry[] = []
  const textLines = [
    `# dev vs hmr-${requestedHmrCount} artifact diff`,
    `# capturedAfterHmrCount=${capturedAfterHmrCount}`,
  ]

  for (const file of files) {
    const before = beforeByFile.get(file)
    const after = afterByFile.get(file)
    const status: WatchArtifactDiffEntry['status'] = before === undefined
      ? 'added'
      : after === undefined
        ? 'removed'
        : before.sha256 === after.sha256 && before.exists === after.exists
          ? 'unchanged'
          : 'changed'
    const entry: WatchArtifactDiffEntry = {
      file,
      status,
      beforeSha256: before?.sha256,
      afterSha256: after?.sha256,
      beforeSize: before?.size,
      afterSize: after?.size,
    }
    if (status !== 'unchanged') {
      if (before?.content != null && after?.content != null) {
        entry.diff = createTextDiff(file, before.content, after.content)
      }
      entries.push(entry)
      textLines.push(`diff -- ${file}`)
      textLines.push(`# status=${status} before=${before?.sha256 ?? 'missing'} after=${after?.sha256 ?? 'missing'} beforeSize=${before?.size ?? 0} afterSize=${after?.size ?? 0}`)
      if (entry.diff) {
        textLines.push(entry.diff.trimEnd())
      }
    }
  }

  return {
    from: 'dev',
    to: 'hmr',
    requestedHmrCount,
    capturedAfterHmrCount,
    changedFileCount: entries.length,
    files: entries,
    text: `${textLines.join('\n')}\n`,
  }
}

export async function createWatchCaseArtifacts(
  dev: WatchArtifactSnapshot,
  hmr: WatchArtifactSnapshot,
  capturedAfterHmrCount: number,
  requestedHmrCount = HMR_ARTIFACT_COUNT,
): Promise<WatchCaseArtifacts> {
  const diff = diffWatchArtifactSnapshots(dev, hmr, requestedHmrCount, capturedAfterHmrCount)
  return {
    requestedHmrCount,
    capturedAfterHmrCount,
    dev,
    hmr,
    diff,
  }
}

export function countClassMutationHmr(metrics: ClassMutationMetrics | undefined) {
  if (!metrics) {
    return 0
  }
  return metrics.rounds.length
    + (metrics.addedClassHmr ? 1 : 0)
    + (metrics.sameClassLiteralHmr ? 1 : 0)
    + (metrics.commentCarrierHmr ? 1 : 0)
}

export function countStyleMutationHmr(metrics: StyleMutationMetrics | undefined) {
  return metrics ? 1 : 0
}

export function countMainStyleHmr(metrics: MainStyleHotUpdateMetrics | undefined) {
  return metrics ? 1 : 0
}

export function countUserReportedHmr(metrics: UserReportedHotUpdateMetrics | undefined) {
  return metrics ? 1 : 0
}

export function countIconifyHmr(metrics: IconifyHotUpdateMetrics | undefined) {
  return metrics ? 1 : 0
}

export function countSubPackageMutationHmr(metrics: SubPackageMutationMetrics | undefined) {
  if (!metrics) {
    return 0
  }
  return countClassMutationHmr(metrics.template)
    + countStyleMutationHmr(metrics.style)
    + countMainStyleHmr(metrics.mainStyleHotUpdate)
}

export { HMR_ARTIFACT_COUNT }
