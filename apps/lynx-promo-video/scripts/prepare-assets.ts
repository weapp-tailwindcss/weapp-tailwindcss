import type { EvidenceSummary, PromoLocale } from '../src/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import QRCode from 'qrcode'
import { getPromoCopy, scenes, VIDEO } from '../src/config'
import { appRoot, publicDir, repoRoot } from './paths'

interface CompatibilityBaseline {
  verifiedAt: string
  versions: EvidenceSummary['versions'] & Record<string, string>
  results: Array<{ ios: { status: string }, android: { status: string } }>
}

function srtTimestamp(frames: number) {
  const milliseconds = Math.round(frames / VIDEO.fps * 1000)
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor(milliseconds % 3_600_000 / 60_000)
  const seconds = Math.floor(milliseconds % 60_000 / 1000)
  const millis = milliseconds % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

function vttTimestamp(frames: number) {
  return srtTimestamp(frames).replace(',', '.')
}

function subtitleFile(locale: PromoLocale, format: 'srt' | 'vtt') {
  const copy = getPromoCopy(locale)
  const entries = scenes.map((scene, index) => {
    const start = scene.from + 8
    const end = scene.from + scene.duration - 8
    const timestamp = format === 'srt' ? `${srtTimestamp(start)} --> ${srtTimestamp(end)}` : `${vttTimestamp(start)} --> ${vttTimestamp(end)}`
    const prefix = format === 'srt' ? `${index + 1}\n` : ''
    return `${prefix}${timestamp}\n${copy.narration[scene.id]}\n`
  }).join('\n')
  return format === 'vtt' ? `WEBVTT\n\n${entries}` : `${entries}`
}

async function latestCompatibilityScreenshot() {
  const root = path.join(repoRoot, 'e2e', '.artifacts', 'lynx-native')
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  const candidates = await Promise.all(entries
    .filter(entry => entry.isDirectory())
    .map(async (entry) => {
      const file = path.join(root, entry.name, 'screen.png')
      const stat = await fs.stat(file).catch(() => undefined)
      return stat ? { file, modified: stat.mtimeMs } : undefined
    }))
  return candidates.filter(item => item !== undefined).sort((a, b) => b.modified - a.modified)[0]?.file
}

async function main() {
  const brandDir = path.join(publicDir, 'brand')
  const captureDir = path.join(publicDir, 'captures')
  const generatedDir = path.join(appRoot, 'src', 'generated')
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
    QRCode.toFile(path.join(brandDir, 'docs-qr.png'), getPromoCopy('zh').docsUrl, { width: 552, margin: 2, color: { dark: '#0b0f10', light: '#f2f7f5' } }),
    QRCode.toFile(path.join(brandDir, 'docs-qr-en.png'), getPromoCopy('en').docsUrl, { width: 552, margin: 2, color: { dark: '#0b0f10', light: '#f2f7f5' } }),
  ])

  const screenshot = await latestCompatibilityScreenshot()
  if (screenshot) {
    await fs.copyFile(screenshot, path.join(captureDir, 'compatibility-lab.png'))
  }

  await Promise.all((['zh', 'en'] as const).flatMap(locale => [
    fs.writeFile(path.join(appRoot, `lynx-promo-${locale}.srt`), subtitleFile(locale, 'srt')),
    fs.writeFile(path.join(appRoot, `lynx-promo-${locale}.vtt`), subtitleFile(locale, 'vtt')),
  ]))
  process.stdout.write(`${JSON.stringify({ evidence, compatibilityScreenshot: screenshot ?? null }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
