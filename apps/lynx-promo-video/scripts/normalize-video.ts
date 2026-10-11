import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { outputDir } from './paths'

const locale = process.argv[2] ?? 'zh'
if (locale !== 'zh' && locale !== 'en') {
  throw new Error(`Unsupported locale: ${locale}`)
}
const input = path.join(outputDir, `lynx-promo-${locale}-1080p.mp4`)
const temporary = path.join(outputDir, `lynx-promo-${locale}-1080p.normalized.mp4`)

await execa('ffmpeg', [
  '-y',
  '-i',
  input,
  '-map',
  '0:v:0',
  '-map',
  '0:a:0?',
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '18',
  '-pix_fmt',
  'yuv420p',
  '-color_range',
  'tv',
  '-c:a',
  'copy',
  '-movflags',
  '+faststart',
  temporary,
], { stdio: 'inherit' })

await fs.rename(temporary, input)
