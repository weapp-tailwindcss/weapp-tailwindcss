import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { scenes, VIDEO } from '../src/config'
import { appRoot, outputDir, publicDir } from './paths'

interface ProbeResult {
  streams: Array<{ codec_type: string, codec_name: string, width?: number, height?: number, pix_fmt?: string, sample_rate?: string, avg_frame_rate?: string }>
  format: { duration: string }
}

async function probe(file: string) {
  const result = await execa('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])
  return JSON.parse(result.stdout) as ProbeResult
}

function subtitleSeconds(value: string) {
  const [hours, minutes, seconds] = value.replace(',', '.').split(':').map(Number)
  return hours * 3600 + minutes * 60 + seconds
}

async function verifySubtitles(locale: 'zh' | 'en') {
  const expectedEnd = VIDEO.durationInFrames / VIDEO.fps
  for (const extension of ['srt', 'vtt'] as const) {
    const file = path.join(appRoot, `lynx-promo-${locale}.${extension}`)
    const content = await fs.readFile(file, 'utf8')
    const entries = [...content.matchAll(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[,.]\d{3})/g)]
    if (entries.length !== scenes.length) {
      throw new Error(`${file} must contain ${scenes.length} subtitle entries.`)
    }
    let previousEnd = 0
    for (const entry of entries) {
      const start = subtitleSeconds(entry[1])
      const end = subtitleSeconds(entry[2])
      if (start < previousEnd || end <= start) {
        throw new Error(`${file} contains overlapping or invalid timestamps.`)
      }
      previousEnd = end
    }
    if (previousEnd < expectedEnd - 1) {
      throw new Error(`${file} does not cover the complete 60-second timeline.`)
    }
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
  const duration = Number(final.format.duration)
  if (!video || video.codec_name !== 'h264' || video.width !== VIDEO.width || video.height !== VIDEO.height || video.pix_fmt !== 'yuv420p' || video.avg_frame_rate !== '30/1') {
    throw new Error(`${finalPath} does not match the required 1080p H.264 output.`)
  }
  if (!audio || audio.codec_name !== 'aac' || audio.sample_rate !== '48000') {
    throw new Error(`${finalPath} audio must be AAC at 48 kHz.`)
  }
  if (Math.abs(duration - VIDEO.durationInFrames / VIDEO.fps) > 0.1) {
    throw new Error(`${finalPath} must be 60 seconds, received ${duration}.`)
  }
}

async function main() {
  for (const capture of ['ios.mp4', 'android.mp4']) {
    const file = path.join(publicDir, 'captures', capture)
    const stat = await fs.stat(file)
    if (stat.size >= 10 * 1024 * 1024) {
      throw new Error(`${capture} must remain below 10 MB.`)
    }
    const metadata = await probe(file)
    const video = metadata.streams.find(stream => stream.codec_type === 'video')
    if (!video || video.codec_name !== 'h264' || video.avg_frame_rate !== '30/1') {
      throw new Error(`${capture} must be H.264 at 30 FPS.`)
    }
  }

  for (const locale of ['zh', 'en'] as const) {
    await verifyVideo(locale)
    await verifyCover(locale)
    await verifySubtitles(locale)
  }
  process.stdout.write(`${JSON.stringify({ locales: ['zh', 'en'], duration: VIDEO.durationInFrames / VIDEO.fps }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
