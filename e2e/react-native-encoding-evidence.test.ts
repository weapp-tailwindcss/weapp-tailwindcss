import type { ReactNativeReport } from './react-native/catalog'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { nativeBuildFixtures } from '../examples/react-native-expo/src/compatibility/protocol'
import { RN_FIXTURE_HASH } from './react-native/catalog'
import { validateNativeEncodingArtifacts } from './react-native/encoding-evidence'
import { writeEncodingFixture } from './react-native/encoding-fixture'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rn-encoding-oracle-'))
  directories.push(directory)
  const report = { runId: 'fresh-run', revision: 'current-revision', platform: 'web', fixtureHash: RN_FIXTURE_HASH, results: Object.entries(nativeBuildFixtures).map(([id, fixture]) => ({ id, encoded: true, encodedStyle: fixture.style })) } as ReactNativeReport
  return { directory, report, ...await writeEncodingFixture(directory, report) }
}

async function rewriteArtifact(output: string, name: 'manifest.json' | 'static-evidence.json' | 'tailwind-input.cjs', source: string) {
  const sha256 = createHash('sha256').update(source).digest('hex')
  const snapshot = JSON.parse(await readFile(path.join(output, 'snapshot.json'), 'utf8'))
  const context = JSON.parse(await readFile(path.join(output, 'run-context.json'), 'utf8'))
  snapshot.files[name].sha256 = sha256
  if (name === 'manifest.json') {
    const publication = JSON.parse(await readFile(path.join(output, 'manifest.ready'), 'utf8'))
    const ready = JSON.stringify({ ...publication, manifestSha256: sha256 })
    snapshot.readyBefore = snapshot.readyAfter = ready
    snapshot.files['manifest.ready'].sha256 = createHash('sha256').update(ready).digest('hex')
    await writeFile(path.join(output, 'manifest.ready'), ready)
  }
  context[name === 'manifest.json' ? 'manifestSha256' : name === 'static-evidence.json' ? 'staticInputSha256' : 'runtimeInputSha256'] = sha256
  await writeFile(path.join(output, name), source)
  await writeFile(path.join(output, 'snapshot.json'), JSON.stringify(snapshot))
  await writeFile(path.join(output, 'run-context.json'), JSON.stringify(context))
}

describe('构建指令编码需要独立 oracle 与本轮实际 manifest', () => {
  it.each(['missing-hash', 'wrong-hash', 'invalid-revision'] as const)('即使归档摘要完整，也拒绝 %s 发布身份', async (kind) => {
    const { directory, report, output } = await fixture()
    const publication = JSON.parse(await readFile(path.join(output, 'manifest.ready'), 'utf8'))
    if (kind === 'missing-hash') {
      delete publication.manifestSha256
    }
    else if (kind === 'wrong-hash') {
      publication.manifestSha256 = 'a'.repeat(64)
    }
    else {
      publication.revision = 1
    }
    const ready = JSON.stringify(publication)
    const snapshot = JSON.parse(await readFile(path.join(output, 'snapshot.json'), 'utf8'))
    snapshot.readyBefore = snapshot.readyAfter = ready
    snapshot.files['manifest.ready'].sha256 = createHash('sha256').update(ready).digest('hex')
    await writeFile(path.join(output, 'manifest.ready'), ready)
    await writeFile(path.join(output, 'snapshot.json'), JSON.stringify(snapshot))
    await expect(validateNativeEncodingArtifacts(report, directory)).rejects.toThrow('发布身份')
  })

  it('五例完整编码与稳定发布 manifest 一致才接受', async () => {
    const { directory, report } = await fixture()
    expect(await validateNativeEncodingArtifacts(report, directory)).toHaveLength(6)
  })

  it.each(Object.keys(nativeBuildFixtures))('encoded=true 不能掩盖 %s 的空编码样式', async (id) => {
    const { directory, report } = await fixture()
    report.results.find(item => item.id === id)!.encodedStyle = {}
    await expect(validateNativeEncodingArtifacts(report, directory)).rejects.toThrow(id)
  })

  it('即使摘要全部更新，声明缺失也不能伪装成合法编码', async () => {
    const { directory, report, manifest, output } = await fixture()
    manifest.rules['lynx-applied']![0]!.style = { display: 'flex' }
    await rewriteArtifact(output, 'manifest.json', JSON.stringify(manifest))
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

  it('实际 Metro manifest 的普通 utility 被 important 配置污染时，完整摘要也不能放行', async () => {
    const { directory, report, manifest, output } = await fixture()
    for (const rule of manifest.rules['bg-[#737373]']!) {
      rule.important = true
    }
    await rewriteArtifact(output, 'manifest.json', JSON.stringify(manifest))
    await expect(validateNativeEncodingArtifacts(report, directory)).rejects.toThrow('important inline-normal')
  })

  it.each(['old-context', 'old-static', 'missing-static', 'missing-authoring', 'forged-authoring', 'forged-runtime-input'] as const)('拒绝 %s 入口归档，重新计算摘要不能代替语义证据', async (mode) => {
    const { directory, report, output } = await fixture()
    if (mode === 'old-context') {
      const context = JSON.parse(await readFile(path.join(output, 'run-context.json'), 'utf8'))
      delete context.version
      await writeFile(path.join(output, 'run-context.json'), JSON.stringify(context))
    }
    else if (mode === 'missing-static') {
      await rm(path.join(output, 'static-evidence.json'))
    }
    else {
      const input = JSON.parse(await readFile(path.join(output, 'static-evidence.json'), 'utf8'))
      if (mode === 'old-static') {
        input.generation.version = 1
      }
      else if (mode === 'missing-authoring') {
        input.generation.authoring.scopes.pop()
      }
      else if (mode === 'forged-authoring') {
        input.generation.authoring.scopes[0].manifest.rules['p-legacy'][0].important = false
      }
      else {
        const source = `${input.generation.runtimeInput.config.source}\n// 伪造的 Metro 入口\n`
        input.generation.runtimeInput.config.source = source
        input.generation.runtimeInput.config.sha256 = createHash('sha256').update(source).digest('hex')
        await rewriteArtifact(output, 'tailwind-input.cjs', source)
      }
      await rewriteArtifact(output, 'static-evidence.json', JSON.stringify(input))
    }
    await expect(validateNativeEncodingArtifacts(report, directory)).rejects.toThrow()
  })
})
