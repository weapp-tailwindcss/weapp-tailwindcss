import type { PromoLocale } from '../src/config'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { getPromoCopy, scenes } from '../src/config'
import { assembleSentenceNarration, getClassnameNarrationPlan, parseNarrationSelection, sentenceAudioArguments, serializeSentenceNarration } from './media/narration-plan'
import { publicDir } from './paths'

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)))
  })
}

async function mediaDuration(media: string) {
  const probe = await execa('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', media])
  return Number(probe.stdout.trim())
}

async function generateVoice(voice: string, text: string, media: string, subtitles: string) {
  await run('uvx', ['--from', 'edge-tts', 'edge-tts', '--voice', voice, '--rate=+8%', '--text', text, '--write-media', media, '--write-subtitles', subtitles])
}

async function generateClassname(locale: PromoLocale, voice: string, outputDir: string, base: string, maximum: number) {
  const plan = getClassnameNarrationPlan(locale)
  const partsDir = path.join(outputDir, `${base}-parts`)
  await fs.mkdir(partsDir, { recursive: true })
  const inputs: string[] = []
  const parts = []
  for (const [index, sentence] of plan.entries()) {
    const partName = String(index + 1).padStart(2, '0')
    const media = path.join(partsDir, `${partName}.mp3`)
    const subtitles = path.join(partsDir, `${partName}.vtt`)
    await generateVoice(voice, sentence.text, media, subtitles)
    inputs.push(media)
    parts.push({ durationSeconds: await mediaDuration(media), subtitles: await fs.readFile(subtitles, 'utf8') })
  }
  const assembly = assembleSentenceNarration(plan, parts, maximum)
  await run('ffmpeg', sentenceAudioArguments(inputs, path.join(outputDir, `${base}.mp3`), assembly))
  await fs.writeFile(path.join(outputDir, `${base}.vtt`), serializeSentenceNarration(assembly))
  await fs.writeFile(path.join(partsDir, 'plan.json'), `${JSON.stringify({ locale, plan, assembly }, null, 2)}\n`)
}

async function main() {
  const { locales, sceneIds } = parseNarrationSelection(process.argv.slice(2), scenes.map(scene => scene.id))

  for (const locale of locales) {
    const voice = locale === 'zh' ? 'zh-CN-XiaoxiaoNeural' : 'en-US-AriaNeural'
    const outputDir = path.join(publicDir, 'audio', 'narration', locale)
    await fs.mkdir(outputDir, { recursive: true })
    for (const [index, scene] of scenes.entries()) {
      if (!sceneIds.includes(scene.id)) {
        continue
      }
      const base = `${String(index + 1).padStart(2, '0')}-${scene.id}`
      const media = path.join(outputDir, `${base}.mp3`)
      const maximum = scene.duration / 30 - 0.2
      if (scene.id === 'classname') {
        await generateClassname(locale, voice, outputDir, base, maximum)
      }
      else {
        await generateVoice(voice, getPromoCopy(locale).narration[scene.id], media, path.join(outputDir, `${base}.vtt`))
      }
      const duration = await mediaDuration(media)
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
