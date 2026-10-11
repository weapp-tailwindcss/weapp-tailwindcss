import type { PromoLocale } from '../src/config'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { getPromoCopy, scenes } from '../src/config'
import { publicDir } from './paths'

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)))
  })
}

async function main() {
  const requested = process.argv[2] ?? 'all'
  const locales: PromoLocale[] = requested === 'all' ? ['zh', 'en'] : [requested as PromoLocale]
  if (locales.some(locale => locale !== 'zh' && locale !== 'en')) {
    throw new Error(`Unsupported locale: ${requested}. Use zh, en, or all.`)
  }

  for (const locale of locales) {
    const voice = locale === 'zh' ? 'zh-CN-XiaoxiaoNeural' : 'en-US-AriaNeural'
    const outputDir = path.join(publicDir, 'audio', 'narration', locale)
    await fs.mkdir(outputDir, { recursive: true })
    for (const [index, scene] of scenes.entries()) {
      const base = `${String(index + 1).padStart(2, '0')}-${scene.id}`
      const media = path.join(outputDir, `${base}.mp3`)
      await run('uvx', [
        '--from',
        'edge-tts',
        'edge-tts',
        '--voice',
        voice,
        '--rate=+8%',
        '--text',
        getPromoCopy(locale).narration[scene.id],
        '--write-media',
        media,
        '--write-subtitles',
        path.join(outputDir, `${base}.vtt`),
      ])

      const probe = await execa('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', media])
      const duration = Number(probe.stdout.trim())
      const maximum = scene.duration / 30 - 0.2
      if (!Number.isFinite(duration) || duration > maximum) {
        throw new Error(`${locale}/${base} narration is ${duration.toFixed(2)}s; it must fit within ${maximum.toFixed(2)}s.`)
      }
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
