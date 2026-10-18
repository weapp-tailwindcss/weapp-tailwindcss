import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { scenes, VIDEO } from '../src/config'
import { assertCaptureInputs, compatibilityScreenshot } from './capture/inputs'
import { readCaptureManifest, resolveManifestPath } from './capture/manifest'
import { assertNoSuspiciousFrames, inspectVideoFrames } from './media/frame-scan'
import { mediaDuration, probe, rawVideoDuration, verifyCaptureVideo, verifyNarration } from './media/probe'
import { assembleSubtitleCues } from './media/subtitles'
import { verifyDevelopmentMetadata, verifyDevelopmentTimeline, verifySubtitleTimeline } from './media/timeline'
import { appRoot, outputDir, publicDir } from './paths'

async function verifySubtitles(locale: 'zh' | 'en') {
  const expectedEnd = VIDEO.durationInFrames / VIDEO.fps
  const narration = Object.fromEntries(await Promise.all(scenes.map(async (scene, index) => {
    const file = path.join(publicDir, 'audio', 'narration', locale, `${String(index + 1).padStart(2, '0')}-${scene.id}.vtt`)
    return [scene.id, await fs.readFile(file, 'utf8')]
  })))
  const expected = assembleSubtitleCues(scenes, VIDEO.fps, narration)
  const generated = JSON.parse(await fs.readFile(path.join(appRoot, 'src', 'generated', 'subtitles.json'), 'utf8')) as Record<string, unknown>
  if (JSON.stringify(generated[locale]) !== JSON.stringify(expected)) {
    throw new Error(`${locale} 烧录字幕与实际旁白不一致，请重新生成素材。`)
  }
  for (const extension of ['srt', 'vtt'] as const) {
    const file = path.join(appRoot, `lynx-promo-${locale}.${extension}`)
    const content = await fs.readFile(file, 'utf8')
    verifySubtitleTimeline(content, scenes, VIDEO.fps, expectedEnd, expected)
  }
}

async function verifyCover(locale: 'zh' | 'en') {
  const file = path.join(outputDir, locale === 'zh' ? 'lynx-promo-cover-1920x1080.png' : 'lynx-promo-cover-en-1920x1080.png')
  const image = await fs.readFile(file)
  if (image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || image.readUInt32BE(16) !== VIDEO.width || image.readUInt32BE(20) !== VIDEO.height) {
    throw new Error(`${file} must be a 1920x1080 PNG.`)
  }
}

async function verifyVideo(locale: 'zh' | 'en') {
  const finalPath = path.join(outputDir, `lynx-promo-${locale}-1080p.mp4`)
  const final = await probe(finalPath)
  const video = final.streams.find(stream => stream.codec_type === 'video')
  const audio = final.streams.find(stream => stream.codec_type === 'audio')
  const duration = mediaDuration(final, finalPath)
  if (!video || video.codec_name !== 'h264' || video.width !== VIDEO.width || video.height !== VIDEO.height || video.pix_fmt !== 'yuv420p' || video.avg_frame_rate !== `${VIDEO.fps}/1`) {
    throw new Error(`${finalPath} does not match the required 1080p H.264 output.`)
  }
  if (!audio || audio.codec_name !== 'aac' || audio.sample_rate !== '48000') {
    throw new Error(`${finalPath} audio must be AAC at 48 kHz.`)
  }
  if (Math.abs(duration - VIDEO.durationInFrames / VIDEO.fps) > 0.1) {
    throw new Error(`${finalPath} must be ${VIDEO.durationInFrames / VIDEO.fps} seconds, received ${duration}.`)
  }
}

async function main() {
  const ambientFile = path.join(publicDir, 'audio', 'ambient.wav')
  const ambientSeconds = mediaDuration(await probe(ambientFile), ambientFile)
  if (Math.abs(ambientSeconds - VIDEO.durationInFrames / VIDEO.fps) > 1 / VIDEO.fps) {
    throw new Error(`环境音必须覆盖完整 ${VIDEO.durationInFrames / VIDEO.fps} 秒视频。`)
  }
  const captureDir = path.join(publicDir, 'captures')
  const manifestFile = path.resolve(process.env.LYNX_PROMO_CAPTURE_MANIFEST ?? path.join(captureDir, 'manifest.json'))
  const manifest = await readCaptureManifest(manifestFile)
  await assertCaptureInputs(manifest, manifestFile, captureDir)
  await compatibilityScreenshot(manifest, manifestFile)
  const nativeScene = scenes.find(scene => scene.id === 'native')!
  for (const platform of ['ios', 'android'] as const) {
    const capture = manifest.platforms[platform]!
    const file = resolveManifestPath(manifestFile, capture.video)
    const stat = await fs.stat(file)
    if (stat.size >= 10 * 1024 * 1024) {
      throw new Error(`${file} must remain below 10 MB.`)
    }
    // NativeScene 从第 70 帧开始播放，必须保留完整场景长度。
    verifyCaptureVideo(await probe(file), file, (70 + nativeScene.duration) / VIDEO.fps)
    rawVideoDuration(await probe(resolveManifestPath(manifestFile, capture.rawVideo)), `${platform} 原片`)
  }
  const development = manifest.development!
  const developmentMetadata = await fs.readFile(path.join(appRoot, 'src', 'generated', 'development.json'), 'utf8')
  verifyDevelopmentMetadata(developmentMetadata, development.clips)
  const developmentFile = resolveManifestPath(manifestFile, development.video)
  const developmentSeconds = verifyCaptureVideo(await probe(developmentFile), developmentFile, 0)
  const rawSeconds = rawVideoDuration(await probe(resolveManifestPath(manifestFile, development.rawVideo)), '开发原片')
  verifyDevelopmentTimeline(development.events, development.clips, scenes, VIDEO.fps, developmentSeconds, rawSeconds)

  for (const locale of ['zh', 'en'] as const) {
    await verifyVideo(locale)
    const finalPath = path.join(outputDir, `lynx-promo-${locale}-1080p.mp4`)
    const frames = await inspectVideoFrames(finalPath, VIDEO.durationInFrames, VIDEO.fps)
    await fs.writeFile(path.join(outputDir, `lynx-promo-${locale}-frame-qa.json`), `${JSON.stringify(frames, null, 2)}\n`)
    assertNoSuspiciousFrames(frames, finalPath)
    await verifyCover(locale)
    await verifySubtitles(locale)
    for (const [index, scene] of scenes.entries()) {
      const file = path.join(publicDir, 'audio', 'narration', locale, `${String(index + 1).padStart(2, '0')}-${scene.id}.mp3`)
      verifyNarration(await probe(file), file, scene.duration / VIDEO.fps - 0.2)
    }
  }
  process.stdout.write(`${JSON.stringify({ locales: ['zh', 'en'], duration: VIDEO.durationInFrames / VIDEO.fps }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
