import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface ExecutionStage {
  target: string
  status: string
  attempted: boolean
  reason?: string
}

/** 调度记录也覆盖预检拒绝；未领取门禁时所有目标必须保留未尝试的阻塞状态。 */
export async function writeExecutionRecord(directory: string, metadata: { runId: string, preflight?: string, filter?: string }, stages: readonly ExecutionStage[]) {
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'index.json'), `${JSON.stringify({ schemaVersion: 2, ...metadata, stages }, null, 2)}\n`)
  const lines = ['# Tailwind CSS 四端执行记录', '', `run ID：${metadata.runId}`, '', '| 目标 | 结果 | 已尝试 | 原因 |', '| --- | --- | --- | --- |', ...stages.map(item => `| ${item.target} | ${item.status} | ${item.attempted} | ${(item.reason ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')} |`), '']
  await writeFile(path.join(directory, 'index.md'), lines.join('\n'))
}

export async function recordPreflightRejection(directory: string, metadata: { runId: string, preflight?: string, filter?: string }, targets: readonly string[], error: unknown) {
  const reason = `全面预检未放行：${String(error)}`
  await writeExecutionRecord(directory, metadata, targets.map(target => ({ target, status: 'blocked', attempted: false, reason })))
}
