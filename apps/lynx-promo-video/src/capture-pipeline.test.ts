import type { CaptureManifest } from '../scripts/capture/manifest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertCaptureInputs, assertDevelopmentArtifacts, compatibilityScreenshot } from '../scripts/capture/inputs'
import { digestFile, manifestRelativePath, resolveManifestPath, sha256, snapshotSources } from '../scripts/capture/manifest'
import { allocateCaptureOutput, preservePublishedCapture } from '../scripts/capture/output'
import { verifyCaptureVideo, verifyNarration } from '../scripts/media/probe'
import { verifyDevelopmentTimeline, verifySubtitleTimeline } from '../scripts/media/timeline'

const directories: string[] = []
async function temporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-promo-pipeline-test-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function stageArtifactFixture() {
  const root = await temporaryDirectory()
  const manifestFile = path.join(root, 'manifest.json')
  async function stage(name: string) {
    const directory = path.join(root, name)
    await fs.mkdir(path.join(directory, 'src'), { recursive: true })
    await fs.writeFile(path.join(directory, 'src', 'Card.tsx'), `${name} source fixture`)
    const bundleFile = path.join(directory, 'bundle-fixture.bin')
    await fs.writeFile(bundleFile, `${name} bundle fixture`)
    const source = await snapshotSources(directory)
    source.root = manifestRelativePath(manifestFile, directory)
    const bundle = await digestFile(bundleFile)
    bundle.path = manifestRelativePath(manifestFile, bundleFile)
    return { id: name, startSeconds: 0, endSeconds: 10, sourceSha256: source.sha256, bundleSha256: bundle.sha256, source, bundle }
  }
  const spacing = await stage('spacing')
  const color = await stage('color')
  const native = { device: 'unit fixture', runtime: 'unit fixture', sourceSha256: color.sourceSha256, rawVideo: '', video: '', cover: '', bundle: color.bundle }
  const manifest: CaptureManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    source: color.source,
    platforms: { ios: { ...native }, android: { ...native } },
    development: { rawVideo: '', video: '', events: [spacing, color], clips: [] },
  }
  return { root, manifestFile, manifest }
}

describe('capture output ownership', () => {
  it('lets the native runner create its output and retains previous runs', async () => {
    const root = await temporaryDirectory()
    const first = await allocateCaptureOutput(root, 'ios')
    // 与 withNativeArtifacts 一样，不使用 recursive；预建目录会触发 EEXIST。
    await fs.mkdir(first.rawDir)
    await fs.writeFile(path.join(first.rawDir, 'fixture.txt'), 'first-run')
    const second = await allocateCaptureOutput(root, 'ios')
    await fs.mkdir(second.rawDir)
    expect(first.runDir).not.toBe(second.runDir)
    expect(await fs.readFile(path.join(first.rawDir, 'fixture.txt'), 'utf8')).toBe('first-run')
  })

  it('archives published media before replacement without removing the originals', async () => {
    const root = await temporaryDirectory()
    const fixture = path.join(root, 'fixture.txt')
    await fs.writeFile(fixture, 'previous-publication')
    const archive = await preservePublishedCapture([fixture, path.join(root, 'absent')], path.join(root, 'archive'))
    expect(await fs.readFile(path.join(archive!, 'fixture.txt'), 'utf8')).toBe('previous-publication')
    expect(await fs.readFile(fixture, 'utf8')).toBe('previous-publication')
  })
})

describe('capture provenance', () => {
  it('binds source content and config to the snapshot digest', async () => {
    const root = await temporaryDirectory()
    await fs.mkdir(path.join(root, 'src'))
    const component = path.join(root, 'src', 'Card.tsx')
    await fs.writeFile(component, 'rounded-[24px]')
    await fs.writeFile(path.join(root, 'lynx.config.ts'), 'pluginConfig')
    const first = await snapshotSources(root)
    expect(first.files.find(file => file.path === 'lynx.config.ts')?.sha256).toBe(sha256('pluginConfig'))
    await fs.writeFile(component, 'rounded-[32px]')
    const second = await snapshotSources(root)
    expect(first.sha256).not.toBe(second.sha256)
  })

  it.each([
    [path.posix, '/repo/public/manifest.json', '../raw/video.mp4', '/repo/raw/video.mp4'],
    [path.posix, '/manifest.json', 'video.mp4', '/video.mp4'],
    [path.win32, 'C:\\repo\\public\\manifest.json', '..\\raw\\video.mp4', 'C:\\repo\\raw\\video.mp4'],
    [path.win32, 'C:\\repo\\manifest.json', '\\raw\\video.mp4', 'C:\\raw\\video.mp4'],
    [path.win32, 'C:\\repo\\manifest.json', 'D:\\raw\\video.mp4', 'D:\\raw\\video.mp4'],
    [path.win32, '\\\\host\\share\\manifest.json', 'video.mp4', '\\\\host\\share\\video.mp4'],
  ])('resolves manifest filesystem paths with their platform path API', (paths, manifest, file, expected) => {
    expect(resolveManifestPath(manifest, file, paths)).toBe(expected)
  })

  it('requires an explicit or manifest-bound compatibility screenshot', async () => {
    const root = await temporaryDirectory()
    const manifestFile = path.join(root, 'manifest.json')
    const manifest = { version: 1 } as CaptureManifest
    await expect(compatibilityScreenshot(manifest, manifestFile)).rejects.toThrow('LYNX_PROMO_COMPATIBILITY_SCREENSHOT')
    const fixture = path.join(root, 'screenshot-fixture.txt')
    await fs.writeFile(fixture, 'file-presence-fixture')
    expect(await compatibilityScreenshot(manifest, manifestFile, fixture)).toBe(fixture)
    manifest.compatibility = { screenshot: 'screenshot-fixture.txt', source: 'explicit fixture' }
    expect(await compatibilityScreenshot(manifest, manifestFile)).toBe(fixture)
    manifest.compatibility.screenshot = 'missing.png'
    await expect(compatibilityScreenshot(manifest, manifestFile)).rejects.toThrow('缺少必需')
  })

  it.each(['add', 'remove'])('rejects a changed source file set: %s', async (operation) => {
    const root = await temporaryDirectory()
    await fs.mkdir(path.join(root, 'src'))
    const component = path.join(root, 'src', 'Card.tsx')
    await fs.writeFile(component, 'recorded-source')
    const source = await snapshotSources(root)
    const manifest: CaptureManifest = { version: 1, createdAt: new Date().toISOString(), source, platforms: {} }
    if (operation === 'add') {
      await fs.writeFile(path.join(root, 'src', 'New.tsx'), 'unrecorded-source')
    }
    else {
      await fs.unlink(component)
    }
    await expect(assertCaptureInputs(manifest, path.join(root, 'manifest.json'), root)).rejects.toThrow('源码文件集与录制摘要不一致')
  })

  it('rejects a source tree changed after the recorded bundle was produced', async () => {
    const root = await temporaryDirectory()
    await fs.mkdir(path.join(root, 'src'))
    const component = path.join(root, 'src', 'Card.tsx')
    await fs.writeFile(component, 'recorded-source')
    const source = await snapshotSources(root)
    const manifest: CaptureManifest = { version: 1, createdAt: new Date().toISOString(), source, platforms: {} }
    const manifestFile = path.join(root, 'manifest.json')
    await expect(assertCaptureInputs(manifest, manifestFile, root)).rejects.toThrow('缺少 ios')
    await fs.writeFile(component, 'unrecorded-source')
    await expect(assertCaptureInputs(manifest, manifestFile, root)).rejects.toThrow('当前源码与录制摘要不一致')
  })
})

const scenes = [
  { id: 'config', from: 150, duration: 240 },
  { id: 'classname', from: 390, duration: 900 },
]
const events = [
  { id: 'config', startSeconds: 0, endSeconds: 8, sourceSha256: 'a'.repeat(64), bundleSha256: 'b'.repeat(64) },
  { id: 'edits', startSeconds: 8, endSeconds: 38, sourceSha256: 'c'.repeat(64), bundleSha256: 'd'.repeat(64), rawStartSeconds: 30, rawEndSeconds: 80 },
]
const clips = [
  { sceneId: 'config', eventId: 'config', startSeconds: 0, endSeconds: 8 },
  { sceneId: 'classname', eventId: 'edits', startSeconds: 8, endSeconds: 38 },
]

describe('media timeline acceptance', () => {
  it('accepts a full development edit and rejects missing, overrun and unbound clips', () => {
    expect(() => verifyDevelopmentTimeline(events, clips, scenes, 30, 38, 100)).not.toThrow()
    expect(() => verifyDevelopmentTimeline(events, [], scenes, 30, 38, 100)).toThrow('缺少 config')
    expect(() => verifyDevelopmentTimeline(events, clips, scenes, 30, 37, 100)).toThrow('时间区间')
    expect(() => verifyDevelopmentTimeline(events, clips, scenes, 30, 38, 50)).toThrow('原片')
    expect(() => verifyDevelopmentTimeline(events, [clips[0], { ...clips[1], eventId: 'absent' }], scenes, 30, 38, 100)).toThrow('未绑定')
    expect(() => verifyDevelopmentTimeline(events, [clips[0], { ...clips[1], endSeconds: 37 }], scenes, 30, 38, 100)).toThrow('时长')
  })

  it('validates the current 75-second subtitle timeline and rejects an old 60-second tail', () => {
    const ending = [{ id: 'cta', from: 2100, duration: 150 }]
    expect(() => verifySubtitleTimeline('00:01:10,267 --> 00:01:14,733', ending, 30, 75)).not.toThrow()
    expect(() => verifySubtitleTimeline('00:00:56,267 --> 00:00:59,733', ending, 30, 75)).toThrow()
    expect(() => verifySubtitleTimeline('00:01:10,267 --> 00:01:15,733', ending, 30, 75)).toThrow('越界')
  })

  it('rejects short captures and narration that spills beyond its scene', () => {
    const video = { streams: [{ codec_type: 'video', codec_name: 'h264', avg_frame_rate: '30/1' }], format: { duration: '15' } }
    expect(verifyCaptureVideo(video, 'capture', 14.34)).toBe(15)
    expect(() => verifyCaptureVideo(video, 'capture', 16)).toThrow('至少需要')
    const audio = { streams: [{ codec_type: 'audio', codec_name: 'mp3' }], format: { duration: '7' } }
    expect(() => verifyNarration(audio, 'config', 7.8)).not.toThrow()
    expect(() => verifyNarration(audio, 'config', 5)).toThrow('超出')
    expect(() => verifyNarration(video, 'config', 20)).toThrow('缺少旁白音轨')
  })
})

describe('development stage provenance', () => {
  it('verifies archived source and bundle bytes for both edits', async () => {
    const { manifest, manifestFile } = await stageArtifactFixture()
    await expect(assertDevelopmentArtifacts(manifest, manifestFile)).resolves.toBeUndefined()
    await fs.writeFile(resolveManifestPath(manifestFile, manifest.development!.events[0].bundle!.path), 'tampered bundle fixture')
    await expect(assertDevelopmentArtifacts(manifest, manifestFile)).rejects.toThrow('spacing bundle 与录制摘要不一致')
  })

  it('rejects missing stage archives and source bytes changed after recording', async () => {
    const { root, manifest, manifestFile } = await stageArtifactFixture()
    const event = manifest.development!.events[0]
    const source = event.source
    event.source = undefined
    await expect(assertDevelopmentArtifacts(manifest, manifestFile)).rejects.toThrow('缺少阶段源码与 bundle 归档')
    event.source = source
    await fs.writeFile(path.join(root, 'spacing', 'src', 'Card.tsx'), 'tampered source fixture')
    await expect(assertDevelopmentArtifacts(manifest, manifestFile)).rejects.toThrow('spacing 当前源码与录制摘要不一致')
  })

  it('requires two distinct edits and the final native bundle identity', async () => {
    const { manifest, manifestFile } = await stageArtifactFixture()
    const events = manifest.development!.events
    events[0].id = 'baseline'
    await expect(assertDevelopmentArtifacts(manifest, manifestFile)).rejects.toThrow('spacing 与 color 两次真实修改')
    events[0] = { ...events[1], id: 'spacing' }
    await expect(assertDevelopmentArtifacts(manifest, manifestFile)).rejects.toThrow('不同的源码及 bundle')
    const other = await stageArtifactFixture()
    other.manifest.platforms.android!.bundle = { ...other.manifest.platforms.android!.bundle, sha256: sha256('old bundle fixture') }
    await expect(assertDevelopmentArtifacts(other.manifest, other.manifestFile)).rejects.toThrow('color 最终源码与双端 bundle')
  })
})
