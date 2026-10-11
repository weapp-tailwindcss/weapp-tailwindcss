import type { Issue33SnapshotMetadata } from '../../../../e2e/watch/hot-update/issue33-snapshot-gate'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  assertIssue33SnapshotGate,
  listIssue33SnapshotEntries,
  readNewIssue33Snapshots,
} from '../../../../e2e/watch/hot-update/issue33-snapshot-gate'
import { createIssue33SnapshotMetadata } from '../../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/class/snapshot'

const project = 'demo/weapp-vite-tailwindcss-v4'
const phases = ['add', 'modify', 'delete'] as const

function createMetric(mutationKind: 'template' | 'script', sourceFile: string, marker: string) {
  return { mutationKind, sourceFile, rounds: [{ roundName: 'issue33-arbitrary', marker }] }
}

function createSnapshots(metric: ReturnType<typeof createMetric>, label: string): Issue33SnapshotMetadata[] {
  return phases.map(phase => createIssue33SnapshotMetadata({
    label,
    project,
    mutationKind: metric.mutationKind,
    roundName: 'issue33-arbitrary',
    phase,
    stage: 'success',
    marker: phase === 'add' ? `${metric.rounds[0]!.marker}-initial` : metric.rounds[0]!.marker,
  }, metric.sourceFile))
}

describe('issue33 snapshot gate', () => {
  const mainMetrics = [
    createMetric('template', 'pages/index.wxml', 'current-main-template'),
    createMetric('script', 'pages/index.ts', 'current-main-script'),
  ]
  const subPackageMetrics = [
    createMetric('template', 'sub-normal/pages/index.wxml', 'current-sub-normal-template'),
    createMetric('template', 'sub-independent/pages/index.wxml', 'current-sub-independent-template'),
  ]
  const mainReport = { cases: [{ project, mutationMetrics: mainMetrics }] }
  const subPackageReport = {
    cases: [{ project, mutationMetrics: subPackageMetrics, subPackageMutationMetrics: subPackageMetrics.map(template => ({ template })) }],
  }
  const mainSnapshots = mainMetrics.flatMap(metric => createSnapshots(metric, project))
  const subPackageSnapshots = subPackageMetrics.flatMap((metric, index) => createSnapshots(metric, `${project}/subpackage-${index}`))

  it('verifies complete main-package template and script evidence', () => {
    expect(() => assertIssue33SnapshotGate(mainReport, mainSnapshots)).not.toThrow()
  })

  it('verifies each actual subpackage template without requiring an unexecuted main-package script', () => {
    expect(() => assertIssue33SnapshotGate(subPackageReport, subPackageSnapshots)).not.toThrow()
  })

  it.each(mainMetrics.flatMap(metric => phases.map(phase => [metric.mutationKind, phase] as const)))(
    'rejects a missing main-package %s %s phase',
    (mutationKind, phase) => {
      const snapshots = mainSnapshots.filter(snapshot => snapshot.mutationKind !== mutationKind || snapshot.phase !== phase)
      expect(() => assertIssue33SnapshotGate(mainReport, snapshots)).toThrow(`${phase}-success`)
    },
  )

  it.each(subPackageMetrics.flatMap(metric => phases.map(phase => [metric.sourceFile, phase] as const)))(
    'rejects a missing subpackage %s %s phase even when another carrier has that phase',
    (sourceFile, phase) => {
      const snapshots = subPackageSnapshots.filter(snapshot => snapshot.sourceIdentity !== sourceFile || snapshot.phase !== phase)
      expect(() => assertIssue33SnapshotGate(subPackageReport, snapshots)).toThrow(`${phase}-success`)
    },
  )

  it('rejects snapshots from another report marker or failed stage', () => {
    expect(() => assertIssue33SnapshotGate(mainReport, mainSnapshots.map(snapshot => ({ ...snapshot, marker: 'old-marker' })))).toThrow('modify-success')
    expect(() => assertIssue33SnapshotGate(mainReport, mainSnapshots.map(snapshot => ({ ...snapshot, stage: 'failure' })))).toThrow('modify-success')
  })

  it('requires a producer source identity even when project, kind, round and marker match', () => {
    const wrongSource = mainSnapshots.map(snapshot => ({ ...snapshot, sourceIdentity: 'another-carrier' }))
    expect(() => assertIssue33SnapshotGate(mainReport, wrongSource)).toThrow('modify-success')
    const missingIdentity = mainSnapshots.map(({ sourceIdentity: _sourceIdentity, ...snapshot }) => snapshot)
    expect(() => assertIssue33SnapshotGate(mainReport, missingIdentity as Issue33SnapshotMetadata[])).toThrow('modify-success')
  })

  it('rejects reusing another subpackage when both carriers share a modify marker', () => {
    const metrics = subPackageMetrics.map(metric => ({ ...metric, rounds: [{ roundName: 'issue33-arbitrary', marker: 'same-millisecond-marker' }] }))
    const report = { cases: [{ project, mutationMetrics: metrics }] }
    const snapshots = metrics.flatMap((metric, index) => createSnapshots(metric, `${project}/subpackage-${index}`))
    expect(() => assertIssue33SnapshotGate(report, snapshots)).not.toThrow()
    expect(() => assertIssue33SnapshotGate(report, snapshots.filter(snapshot => snapshot.sourceIdentity !== metrics[1]!.sourceFile))).toThrow('modify-success')
  })

  it.each([
    '/project/demo/pages/index.wxml',
    'D:\\project\\demo\\pages\\index.wxml',
    '..\\..\\demo\\pages\\index.wxml',
    '../../demo/pages/index.wxml',
  ])('keeps producer metadata identity for %s without interpreting it as a host path', (sourceFile) => {
    const metric = createMetric('template', sourceFile, 'current-path-marker')
    const report = { cases: [{ project, mutationMetrics: [metric] }] }
    const snapshots = createSnapshots(metric, project)
    expect(snapshots.map(snapshot => snapshot.sourceIdentity)).toEqual([sourceFile, sourceFile, sourceFile])
    expect(() => assertIssue33SnapshotGate(report, snapshots)).not.toThrow()
    expect(() => assertIssue33SnapshotGate(report, snapshots.map(snapshot => snapshot.phase === 'add' ? { ...snapshot, sourceIdentity: 'another-source' } : snapshot))).toThrow('add-success')
  })

  it('excludes prior command snapshots while reading the new scope evidence', async () => {
    const snapshotsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watch-issue33-gate-'))
    const writeSnapshots = async (snapshots: Issue33SnapshotMetadata[], prefix: string) => {
      for (const [index, snapshot] of snapshots.entries()) {
        const dir = path.join(snapshotsDir, `${prefix}-${index}`)
        await fs.mkdir(dir)
        await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(snapshot), 'utf8')
      }
    }
    try {
      await writeSnapshots(mainSnapshots, 'previous-command')
      const previousEntries = await listIssue33SnapshotEntries(snapshotsDir)
      await writeSnapshots(subPackageSnapshots, 'current-command')
      const snapshots = await readNewIssue33Snapshots(snapshotsDir, previousEntries)
      expect(snapshots).toHaveLength(subPackageSnapshots.length)
      expect(() => assertIssue33SnapshotGate(subPackageReport, snapshots)).not.toThrow()
      expect(() => assertIssue33SnapshotGate(mainReport, snapshots)).toThrow('modify-success')
    }
    finally {
      await fs.rm(snapshotsDir, { recursive: true, force: true })
    }
  })

  it('propagates missing metadata rather than silently accepting incomplete evidence', async () => {
    const snapshotsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watch-issue33-missing-'))
    try {
      const previousEntries = await listIssue33SnapshotEntries(snapshotsDir)
      await fs.mkdir(path.join(snapshotsDir, 'current-command'))
      await expect(readNewIssue33Snapshots(snapshotsDir, previousEntries)).rejects.toMatchObject({ code: 'ENOENT' })
    }
    finally {
      await fs.rm(snapshotsDir, { recursive: true, force: true })
    }
  })
})
