import type { NativeMediaGateEvidence, NativePlatformReport } from '../examples/react-lynx/src/compatibility/types'
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { mediaGateArtifactNames, validateMediaGateEvidence } from '../examples/react-lynx/src/compatibility/media-gate-contract'
import { validateMediaGateArtifacts } from './lynx/media-gate'
import { PNG } from './lynx/png'

const context = { version: 1 as const, runId: '00000000-0000-4000-8000-000000000001', bundleSha256: 'a'.repeat(64) }
const ids = ['base', 'control', 'unguarded', 'min-width', 'hover-hover', 'hover-none'] as const
const rect = (width: number, height: number) => ({ left: 0, top: 0, right: width, bottom: height, width, height })
function evidence(): NativeMediaGateEvidence {
  return {
    limitationId: 'lynx4.0.1-media-hover-unknown-v1',
    runId: context.runId,
    bundleSha256: context.bundleSha256,
    sdkVersion: '4.0.1',
    probes: ids.map(id => ({ id, probe: rect(id === 'unguarded' || id === 'min-width' ? 32 : 16, 16), container: rect(64, 64) })),
  }
}
const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true }))) })

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx media contract '))
  directories.push(directory)
  const mediaGate = evidence()
  const report = { platform: 'android', mediaGate, evidence: { ...context, artifacts: [] }, environment: { viewport: { pixelRatio: 1 } } } as unknown as NativePlatformReport
  for (const probe of mediaGate.probes) {
    const png = new PNG({ width: 64, height: 64 })
    png.data.fill(255)
    const positive = probe.id === 'unguarded' || probe.id === 'min-width'
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < (positive ? 32 : 16); x++) png.data.set(positive ? [22, 163, 74, 255] : [220, 38, 38, 255], (y * 64 + x) * 4)
    }
    await fs.writeFile(path.join(directory, `media-hover-v1-${probe.id}.png`), PNG.sync.write(png))
  }
  await fs.writeFile(path.join(directory, 'media-hover-v1.native.json'), JSON.stringify({ version: 1, source: 'lynx-native-media-gate-v1', context, mediaGate }))
  return { directory, report }
}

describe('固定 SDK 的媒体必要条件负向合同', () => {
  it('只验证媒体条件，不生成或通过任何 hover 输入 checkpoint', async () => {
    const { directory, report } = await fixture()
    expect(mediaGateArtifactNames()).toHaveLength(7)
    expect(() => validateMediaGateEvidence(report.mediaGate!, context)).not.toThrow()
    await expect(validateMediaGateArtifacts(report, directory)).resolves.toBeUndefined()
  })

  it.each(['sdk', 'run', 'bundle', 'missing', 'duplicate', 'positive', 'negative'] as const)('拒绝 %s 身份、缺证与几何不符', (mode) => {
    const proof = evidence()
    if (mode === 'sdk') proof.sdkVersion = '4.0.2'
    if (mode === 'run') proof.runId = 'old'
    if (mode === 'bundle') proof.bundleSha256 = 'b'.repeat(64)
    if (mode === 'missing') proof.probes.pop()
    if (mode === 'duplicate') proof.probes[1] = proof.probes[0]!
    if (mode === 'positive') proof.probes[2]!.probe = rect(16, 16)
    if (mode === 'negative') proof.probes[4]!.probe = rect(32, 16)
    expect(() => validateMediaGateEvidence(proof, context)).toThrow()
  })

  it.each(['wrong-pixels', 'guard-matches', 'missing-frame', 'old-sidecar', 'changed-sdk'] as const)('原始PNG与宿主侧车拒绝 %s', async (mode) => {
    const { directory, report } = await fixture()
    const file = path.join(directory, 'media-hover-v1-unguarded.png')
    if (mode === 'wrong-pixels') await fs.copyFile(path.join(directory, 'media-hover-v1-base.png'), file)
    if (mode === 'guard-matches') await fs.copyFile(file, path.join(directory, 'media-hover-v1-hover-hover.png'))
    if (mode === 'missing-frame') await fs.rm(file)
    if (mode === 'old-sidecar' || mode === 'changed-sdk') {
      const sidecar = JSON.parse(await fs.readFile(path.join(directory, 'media-hover-v1.native.json'), 'utf8'))
      if (mode === 'old-sidecar') sidecar.context.runId = 'old'
      else sidecar.mediaGate.sdkVersion = '4.0.2'
      await fs.writeFile(path.join(directory, 'media-hover-v1.native.json'), JSON.stringify(sidecar))
    }
    await expect(validateMediaGateArtifacts(report, directory)).rejects.toThrow()
  })
})
