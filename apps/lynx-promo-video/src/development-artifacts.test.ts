import type { CaptureManifest, DevelopmentComparisonShot, FileDigest } from '../scripts/capture/manifest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertDevelopmentArtifacts } from '../scripts/capture/inputs'
import { digestFile, manifestRelativePath, resolveManifestPath, sha256, snapshotSources } from '../scripts/capture/manifest'
import { developmentFixture } from './test-fixtures/development'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-shot-artifacts-'))
  directories.push(root)
  const manifestFile = path.join(root, 'manifest.json')
  const development = developmentFixture()
  const events = []
  for (const stage of ['initial', 'spacing', 'color']) {
    const stageRoot = path.join(root, stage)
    await fs.mkdir(path.join(stageRoot, 'src'), { recursive: true })
    await fs.writeFile(path.join(stageRoot, 'src', 'Card.tsx'), `${stage} source bytes`)
    const bundleFile = path.join(stageRoot, 'main.lynx.bundle')
    await fs.writeFile(bundleFile, `${stage} bundle bytes`)
    const source = await snapshotSources(stageRoot)
    source.root = manifestRelativePath(manifestFile, stageRoot)
    const bundle = await digestFile(bundleFile)
    bundle.path = manifestRelativePath(manifestFile, bundleFile)
    events.push({ id: stage, startSeconds: 0, endSeconds: 100, sourceSha256: source.sha256, bundleSha256: bundle.sha256, source, bundle })
  }
  const files: FileDigest[] = []
  for (const shot of development.shots) {
    if (shot.kind === 'video') {
      files.push(shot.media)
      if (shot.preview) {
        files.push(shot.preview.media, shot.preview.sourceVideo)
      }
    }
    else {
      files.push(shot.before.media, shot.before.sourceVideo, shot.after.media, shot.after.sourceVideo)
    }
  }
  for (const file of files) {
    const content = `actual artifact bytes: ${file.path}`
    await fs.writeFile(resolveManifestPath(manifestFile, file.path), content)
    file.sha256 = sha256(content)
  }
  const final = events[2]
  const native = { device: 'fixture device', runtime: 'fixture runtime', rawVideo: '', video: '', cover: '', sourceSha256: final.sourceSha256, bundle: final.bundle }
  const manifest: CaptureManifest = {
    version: 1, createdAt: new Date().toISOString(), source: final.source,
    platforms: { ios: { ...native }, android: { ...native } },
    development: { rawVideo: '', video: '', events, clips: [], shots: development.shots },
  }
  return { root, manifestFile, manifest }
}

describe('三阶段截图与媒体归档', () => {
  it('核对三阶段源码、bundle、实际视频和静帧的字节摘要', async () => {
    const { manifest, manifestFile } = await fixture()
    await expect(assertDevelopmentArtifacts(manifest, manifestFile)).resolves.toBeUndefined()
    await fs.writeFile(resolveManifestPath(manifestFile, 'spacing.png'), 'replaced screenshot')
    await expect(assertDevelopmentArtifacts(manifest, manifestFile)).rejects.toThrow('spacing.png 镜头素材与录制摘要不一致')
  })

  it('新分镜不能遗漏初始源码，也不能复用一次修改的源码和 bundle', async () => {
    const { manifest, manifestFile } = await fixture()
    const events = manifest.development!.events
    const initial = events.shift()!
    await expect(assertDevelopmentArtifacts(manifest, manifestFile)).rejects.toThrow('三阶段独立源码')
    events.unshift({ ...events[0], id: initial.id })
    await expect(assertDevelopmentArtifacts(manifest, manifestFile)).rejects.toThrow('三阶段独立源码')
  })

  it('同一阶段前后对比必须引用同一张截图，素材摘要不能为空', async () => {
    const { manifest, manifestFile } = await fixture()
    const comparison = manifest.development!.shots!.find(shot => shot.id === '2-comparison')! as DevelopmentComparisonShot
    const screenshot = comparison.before.media
    comparison.before.media = { ...screenshot, path: 'other.png' }
    await fs.writeFile(resolveManifestPath(manifestFile, 'other.png'), await fs.readFile(resolveManifestPath(manifestFile, screenshot.path)))
    await expect(assertDevelopmentArtifacts(manifest, manifestFile)).rejects.toThrow('复用同一张阶段截图')
    comparison.before.media = { ...screenshot, sha256: '' }
    await expect(assertDevelopmentArtifacts(manifest, manifestFile)).rejects.toThrow('SHA256')
  })
})
