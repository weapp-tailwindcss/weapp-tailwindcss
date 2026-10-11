import type { Issue33SnapshotMetadata } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/snapshot'
import fs from 'node:fs/promises'
import path from 'node:path'

export type { Issue33SnapshotMetadata }

interface MutationMetric {
  mutationKind: string
  sourceFile: string
  rounds?: Array<{ roundName: string, marker: string }>
}

interface SnapshotReport {
  cases: Array<{
    project: string
    mutationMetrics: MutationMetric[]
    subPackageMutationMetrics?: Array<{ template: MutationMetric }>
  }>
}

/** 记录命令启动前的快照目录，避免上次运行或另一个 scope 的证据放行本轮。 */
export async function listIssue33SnapshotEntries(snapshotsDir: string) {
  try {
    const entries = await fs.readdir(snapshotsDir, { withFileTypes: true })
    return new Set(entries.filter(entry => entry.isDirectory()).map(entry => entry.name))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Set<string>()
    }
    throw error
  }
}

/** 只读取本次命令新增的 metadata；缺失或损坏的证据不能静默忽略。 */
export async function readNewIssue33Snapshots(snapshotsDir: string, previousEntries: Set<string>) {
  const entries = await listIssue33SnapshotEntries(snapshotsDir)
  return Promise.all([...entries].filter(entry => !previousEntries.has(entry)).map(async (entry) => {
    const raw = await fs.readFile(path.join(snapshotsDir, entry, 'meta.json'), 'utf8')
    return JSON.parse(raw) as Issue33SnapshotMetadata
  }))
}

/** 按已验收报告的实际 carrier 检查 CRUD 证据，主包 script 与每个分包 template 分别验收。 */
export function assertIssue33SnapshotGate(report: SnapshotReport, snapshots: Issue33SnapshotMetadata[]) {
  const verifiedCarriers = new Set<string>()
  for (const item of report.cases) {
    const metrics = [...item.mutationMetrics, ...(item.subPackageMutationMetrics ?? []).map(metric => metric.template)]
    for (const metric of metrics) {
      if (metric.mutationKind !== 'template' && metric.mutationKind !== 'script') {
        continue
      }
      const round = metric.rounds?.find(round => round.roundName === 'issue33-arbitrary')
      if (!round) {
        continue
      }
      const carrierKey = JSON.stringify([item.project, metric.mutationKind, metric.sourceFile, round.marker])
      if (verifiedCarriers.has(carrierKey)) {
        continue
      }
      verifiedCarriers.add(carrierKey)
      const label = `[issue33] ${item.project} (${metric.sourceFile}) ${metric.mutationKind}`
      const modify = snapshots.find(snapshot => snapshot.project === item.project
        && snapshot.mutationKind === metric.mutationKind
        && snapshot.sourceIdentity === metric.sourceFile
        && snapshot.roundName === round.roundName
        && snapshot.phase === 'modify'
        && snapshot.stage === 'success'
        && snapshot.marker === round.marker)
      if (!modify) {
        throw new Error(`${label} missing current snapshot phase output: modify-success`)
      }
      for (const phase of ['add', 'delete']) {
        const found = snapshots.some(snapshot => snapshot.project === modify.project
          && snapshot.label === modify.label
          && snapshot.sourceFile === modify.sourceFile
          && snapshot.sourceIdentity === metric.sourceFile
          && snapshot.mutationKind === modify.mutationKind
          && snapshot.roundName === modify.roundName
          && snapshot.phase === phase
          && snapshot.stage === 'success'
          && (phase === 'add' || snapshot.marker === round.marker))
        if (!found) {
          throw new Error(`${label} missing current snapshot phase output: ${phase}-success`)
        }
      }
    }
  }
}
