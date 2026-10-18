import type { EvidenceSummary, PromoLocale } from '../src/config'
import type { SubtitleCue } from './media/subtitles'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import QRCode from 'qrcode'
import { getPromoCopy, scenes, VIDEO } from '../src/config'
import { assertCaptureInputs, compatibilityScreenshot } from './capture/inputs'
import { manifestRelativePath, readCaptureManifest, resolveManifestPath, writeCaptureManifest } from './capture/manifest'
import { developmentRenderMetadata } from './capture/render-metadata'
import { verifyDevelopmentMedia } from './media/development-media'
import { probe, rawVideoDuration, verifyCaptureVideo } from './media/probe'
import { assembleSubtitleCues, serializeSubtitles } from './media/subtitles'
import { verifyDevelopmentTimeline } from './media/timeline'
import { appRoot, publicDir, repoRoot } from './paths'

interface CompatibilityBaseline {
  verifiedAt: string
  versions: EvidenceSummary['versions'] & Record<string, string>
  results: Array<{ ios: { status: string }, android: { status: string } }>
}

async function main() {
  const brandDir = path.join(publicDir, 'brand')
  const captureDir = path.join(publicDir, 'captures')
  const generatedDir = path.join(appRoot, 'src', 'generated')
  const manifestFile = path.resolve(process.env.LYNX_PROMO_CAPTURE_MANIFEST ?? path.join(captureDir, 'manifest.json'))
  const manifest = await readCaptureManifest(manifestFile)
  await assertCaptureInputs(manifest, manifestFile, captureDir)
  const development = manifest.development!
  const developmentFile = resolveManifestPath(manifestFile, development.video)
  const developmentSeconds = verifyCaptureVideo(await probe(developmentFile), developmentFile, 0)
  const rawSeconds = rawVideoDuration(await probe(resolveManifestPath(manifestFile, development.rawVideo)), '开发原片')
  verifyDevelopmentTimeline(development.events, development.clips, scenes, VIDEO.fps, developmentSeconds, rawSeconds, development.shots)
  await verifyDevelopmentMedia(development.shots ?? [], manifestFile)
  const screenshot = await compatibilityScreenshot(manifest, manifestFile, process.env.LYNX_PROMO_COMPATIBILITY_SCREENSHOT)
  await Promise.all([
    fs.mkdir(brandDir, { recursive: true }),
    fs.mkdir(captureDir, { recursive: true }),
    fs.mkdir(generatedDir, { recursive: true }),
  ])

  const baselinePath = path.join(repoRoot, 'examples', 'react-lynx', 'src', 'compatibility', 'baseline.json')
  const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8')) as CompatibilityBaseline
  const evidence: EvidenceSummary = {
    total: baseline.results.length,
    supported: baseline.results.filter(item => item.ios.status === 'supported' && item.android.status === 'supported').length,
    unsupported: baseline.results.filter(item => item.ios.status === 'unsupported' && item.android.status === 'unsupported').length,
    platformDifferences: baseline.results.filter(item => item.ios.status !== item.android.status).length,
    verifiedAt: baseline.verifiedAt,
    versions: {
      tailwindcss: baseline.versions.tailwindcss,
      lynxEngine: baseline.versions.lynxEngine,
    },
  }

  await Promise.all([
    fs.copyFile(path.join(repoRoot, 'assets', 'logo-square.svg'), path.join(brandDir, 'weapp-tailwindcss.svg')),
    fs.copyFile(path.join(repoRoot, 'website', 'src', 'assets', 'framework-logos', 'lynx.svg'), path.join(brandDir, 'lynx.svg')),
    fs.writeFile(path.join(generatedDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`),
    fs.writeFile(path.join(generatedDir, 'development.json'), `${JSON.stringify(developmentRenderMetadata(development, manifestFile, publicDir), null, 2)}\n`),
    QRCode.toFile(path.join(brandDir, 'docs-qr.png'), getPromoCopy('zh').docsUrl, { width: 552, margin: 2, color: { dark: '#0b0f10', light: '#f2f7f5' } }),
    QRCode.toFile(path.join(brandDir, 'docs-qr-en.png'), getPromoCopy('en').docsUrl, { width: 552, margin: 2, color: { dark: '#0b0f10', light: '#f2f7f5' } }),
  ])

  const publicScreenshot = path.join(captureDir, 'compatibility-lab.png')
  if (screenshot !== publicScreenshot) {
    await fs.copyFile(screenshot, publicScreenshot)
  }
  manifest.compatibility = {
    screenshot: manifestRelativePath(manifestFile, publicScreenshot),
    source: process.env.LYNX_PROMO_COMPATIBILITY_SCREENSHOT ?? manifest.compatibility?.source ?? screenshot,
  }
  await writeCaptureManifest(manifestFile, manifest)

  const subtitleTracks = {} as Record<PromoLocale, SubtitleCue[]>
  for (const locale of ['zh', 'en'] as const) {
    const narration = Object.fromEntries(await Promise.all(scenes.map(async (scene, index) => [
      scene.id,
      await fs.readFile(path.join(publicDir, 'audio', 'narration', locale, `${String(index + 1).padStart(2, '0')}-${scene.id}.vtt`), 'utf8'),
    ])))
    const cues = assembleSubtitleCues(scenes, VIDEO.fps, narration)
    subtitleTracks[locale] = cues
    await Promise.all((['srt', 'vtt'] as const).map(format => fs.writeFile(
      path.join(appRoot, `lynx-promo-${locale}.${format}`),
      serializeSubtitles(cues, VIDEO.fps, format),
    )))
  }
  await fs.writeFile(path.join(generatedDir, 'subtitles.json'), `${JSON.stringify(subtitleTracks, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ evidence, compatibilityScreenshot: screenshot ?? null }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
