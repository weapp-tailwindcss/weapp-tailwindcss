import type { ReactNativeReport } from './react-native/catalog'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { nativeBuildFixtures } from '../examples/react-native-expo/src/compatibility/protocol'
import { validateNativeEncodingArtifacts } from './react-native/encoding-evidence'
import { writeEncodingFixture } from './react-native/encoding-fixture'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rn-encoding-oracle-'))
  directories.push(directory)
  const report = { runId: 'fresh-run', revision: 'current-revision', platform: 'web', results: Object.entries(nativeBuildFixtures).map(([id, fixture]) => ({ id, encoded: true, encodedStyle: fixture.style })) } as ReactNativeReport
  return { directory, report, ...await writeEncodingFixture(directory, report) }
}

describe('构建指令编码需要独立 oracle 与本轮实际 manifest', () => {
  it('五例完整编码与稳定发布 manifest 一致才接受', async () => {
    const { directory, report } = await fixture()
    expect(await validateNativeEncodingArtifacts(report, directory)).toHaveLength(4)
  })

  it.each(Object.keys(nativeBuildFixtures))('encoded=true 不能掩盖 %s 的空编码样式', async (id) => {
    const { directory, report } = await fixture()
    report.results.find(item => item.id === id)!.encodedStyle = {}
    await expect(validateNativeEncodingArtifacts(report, directory)).rejects.toThrow(id)
  })

  it('即使摘要全部更新，声明缺失也不能伪装成合法编码', async () => {
    const { directory, report, manifest, output } = await fixture()
    manifest.rules['lynx-applied']![0]!.style = { display: 'flex' }
    const source = JSON.stringify(manifest)
    const sha256 = createHash('sha256').update(source).digest('hex')
    const snapshot = JSON.parse(await readFile(path.join(output, 'snapshot.json'), 'utf8'))
    snapshot.files['manifest.json'].sha256 = sha256
    await writeFile(path.join(output, 'manifest.json'), source)
    await writeFile(path.join(output, 'snapshot.json'), JSON.stringify(snapshot))
    await writeFile(path.join(output, 'run-context.json'), JSON.stringify({ runId: report.runId, revision: report.revision, manifestSha256: sha256 }))
    await expect(validateNativeEncodingArtifacts(report, directory)).rejects.toThrow('directive-apply')
  })

  it.each(['missing', 'stale', 'bytes', 'publication'] as const)('拒绝 %s manifest 证据', async (kind) => {
    const { directory, report, output } = await fixture()
    if (kind === 'missing') {
      await rm(path.join(output, 'manifest.json'))
    }
    else if (kind === 'stale') {
      await writeFile(path.join(output, 'run-context.json'), JSON.stringify({ runId: 'old-run' }))
    }
    else if (kind === 'bytes') {
      await writeFile(path.join(output, 'manifest.json'), '{}')
    }
    else {
      const snapshot = JSON.parse(await readFile(path.join(output, 'snapshot.json'), 'utf8'))
      snapshot.stablePublication = false
      await writeFile(path.join(output, 'snapshot.json'), JSON.stringify(snapshot))
    }
    await expect(validateNativeEncodingArtifacts(report, directory)).rejects.toThrow()
  })
})
