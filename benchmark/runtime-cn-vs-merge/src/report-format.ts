import { readFileSync } from 'node:fs'
import type { EnvInfo } from './env'
import { formatBytes } from './stats'
import type { CaseBench, CaseParity } from './results'
import type { SubjectId } from './subjects'

export interface ParityFile {
  env: EnvInfo
  summary: {
    total: number
    weappCnVsMergeMismatches: string[]
    weappSlimVsMergeMismatches: string[]
    upstreamMismatches: string[]
    upstreamMergeMismatches?: string[]
  }
  cases: CaseParity[]
}

export interface BundleFile {
  env: EnvInfo
  results: Array<{
    id: string
    label: string
    rawBytes: number
    gzipBytes: number
    brotliBytes: number
  }>
}

export interface BenchFile {
  env: EnvInfo
  subjects: Array<{
    subjectId: SubjectId
    cases: CaseBench[]
  }>
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

export function mdTable(headers: string[], rows: string[][]) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ].join('\n')
}

export function envBlock(env: EnvInfo) {
  return [
    `- 时间：${env.timestamp}`,
    `- Commit：\`${env.commit}\``,
    `- Node：${env.node}`,
    `- OS：${env.platform} ${env.release} (${env.arch})`,
    `- CPU：${env.cpu}`,
    `- 内存：${formatBytes(env.totalMemoryBytes)}`,
  ].join('\n')
}

export function code(value: string) {
  const trimmed = value.length > 72 ? `${value.slice(0, 69)}...` : value
  return `\`${trimmed.replace(/\|/g, '\\|')}\``
}

export function mismatchList(ids: string[]) {
  return ids.length === 0 ? '无' : ids.map(id => `\`${id}\``).join('、')
}

export function ratio(numerator: number, denominator: number) {
  if (numerator <= 0 || denominator <= 0) {
    return 'n/a'
  }
  return `${(numerator / denominator).toFixed(2)}×`
}

export function indexBench(bench: BenchFile) {
  return Object.fromEntries(
    bench.subjects.map(item => [item.subjectId, Object.fromEntries(item.cases.map(row => [row.id, row]))]),
  ) as Record<SubjectId, Record<string, CaseBench>>
}
