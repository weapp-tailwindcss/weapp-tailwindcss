import type { WatchCase } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { expandOutputFileEntries } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations'
import { readFileIfExists } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { readReachableMiniProgramStyleFiles } from './hbuilderx-local/styles'

export type ArtifactKind = 'wxml' | 'js' | 'style'
export type IdeWatchCase = WatchCase & { miniprogramRoot: string }

export interface ArtifactSnapshot {
  kind: ArtifactKind
  file: string
  content: string
}

export async function readArtifacts(watchCase: IdeWatchCase): Promise<ArtifactSnapshot[]> {
  const styleFiles = await expandOutputFileEntries([
    ...watchCase.outputStyleCandidates,
    ...watchCase.globalStyleCandidates,
  ])
  const files: Array<{ kind: ArtifactKind, file: string }> = [
    { kind: 'wxml', file: watchCase.outputWxml },
    { kind: 'js', file: watchCase.outputJs },
    ...styleFiles.map(file => ({ kind: 'style' as const, file })),
  ]
  const snapshots: ArtifactSnapshot[] = []
  const visited = new Set<string>()
  const styleExtensions = [...new Set(['.css', ...styleFiles.map(file => path.extname(file))])]

  for (const item of files) {
    if (visited.has(item.file)) {
      continue
    }
    const content = await readFileIfExists(item.file)
    if (content != null) {
      const reachable = item.kind === 'style'
        ? await readReachableMiniProgramStyleFiles(watchCase.miniprogramRoot, item.file, styleExtensions)
        : [{ file: item.file, content }]
      for (const source of reachable) {
        if (!visited.has(source.file)) {
          snapshots.push({ kind: item.kind, ...source })
          visited.add(source.file)
        }
      }
    }
  }
  return snapshots
}

export async function collectArtifactMtimes(watchCase: IdeWatchCase) {
  const artifacts = await readArtifacts(watchCase)
  const mtimes = new Map<string, number>()

  for (const item of artifacts) {
    const stat = await fs.stat(item.file).catch(() => undefined)
    mtimes.set(item.file, stat?.mtimeMs ?? 0)
  }

  return { artifacts, mtimes }
}

export function joinArtifactContent(artifacts: ArtifactSnapshot[], kind: ArtifactKind) {
  return artifacts.filter(item => item.kind === kind).map(item => item.content).join('\n')
}

export function countChangedArtifacts(before: ArtifactSnapshot[], after: ArtifactSnapshot[]) {
  const beforeByFile = new Map(before.map(item => [item.file, item.content]))
  let changed = 0

  for (const item of after) {
    if (beforeByFile.get(item.file) !== item.content) {
      changed += 1
    }
  }
  return changed
}

export function hasAnyNeedle(artifacts: ArtifactSnapshot[], needles: string[]) {
  return artifacts.some(artifact => needles.some(needle => artifact.content.includes(needle)))
}

function unquoteCssImportRequest(request: string) {
  const trimmed = request.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseCssImportRequest(line: string) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('@import')) {
    return undefined
  }
  const params = trimmed
    .slice('@import'.length)
    .trim()
    .replace(/;$/, '')
    .trim()
  if (params.startsWith('url(')) {
    const endIndex = params.indexOf(')')
    return endIndex === -1 ? undefined : unquoteCssImportRequest(params.slice(4, endIndex))
  }
  const quote = params[0]
  if (quote === '"' || quote === '\'') {
    const endIndex = params.indexOf(quote, 1)
    return endIndex === -1 ? undefined : params.slice(1, endIndex)
  }
  return params.split(/\s+/, 1)[0]
}

function findUnsupportedMiniProgramCssImport(css: string) {
  for (const line of css.split(/\r?\n/)) {
    const request = parseCssImportRequest(line)
    if (request && !request.startsWith('.') && !request.startsWith('/')) {
      return line.trim()
    }
  }
  return undefined
}

export function assertNoUnsupportedMiniProgramCssImport(watchCase: Pick<WatchCase, 'label'>, artifacts: ArtifactSnapshot[], phase: string) {
  for (const artifact of artifacts) {
    if (artifact.kind !== 'style') {
      continue
    }
    const unsupportedImport = findUnsupportedMiniProgramCssImport(artifact.content)
    if (!unsupportedImport) {
      continue
    }
    throw new Error(`[${watchCase.label}] ${phase} emitted unsupported mini-program CSS import in ${artifact.file}: ${unsupportedImport}`)
  }
}

export function summarizeChangedArtifacts(before: ArtifactSnapshot[], after: ArtifactSnapshot[]) {
  const beforeByFile = new Map(before.map(item => [item.file, item.content]))
  return after
    .filter(item => beforeByFile.get(item.file) !== item.content)
    .map(item => `${item.kind}:${item.file}`)
}
