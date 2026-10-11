import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { films, voices } from '../src/config'
import { scriptFor } from '../src/content/narration'
import { voiceCacheValid } from './audio/cache'
import { validateWords } from './audio/subtitles'
import { appRoot, audioDir } from './paths'
import { selection } from './selection'

const errors: string[] = []
for (const { locale, format } of selection(process.argv.slice(2)).variants) {
  const directory = path.join(audioDir, locale, format, 'voice')
  await fs.mkdir(directory, { recursive: true })
  const manifest = []
  for (const scene of films[format].scenes) {
    const script = scriptFor(locale, format, scene.id)
    const text = script.spoken ?? script.captions.join(locale === 'en' ? ' ' : '')
    const file = path.join(directory, `${scene.id}.mp3`)
    const wordsFile = path.join(directory, `${scene.id}.words.json`)
    const voice = voices[locale]
    const signature = `${text}|${locale}|${voice.name}|${voice.rate}|edge-tts-7.2.8|word-boundaries-v2`
    const stamp = path.join(directory, `${scene.id}.txt`)
    const probe = async () => Number((await execa('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file])).stdout.trim())
    let duration = 0
    if (await voiceCacheValid(file, stamp, wordsFile, signature, text)) {
      duration = await probe().catch(() => 0)
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      await fs.rm(stamp, { force: true })
      await execa('uvx', ['--from', 'edge-tts==7.2.8', 'python', path.join(appRoot, 'scripts', 'audio', 'tts.py'), text, file, voice.name, voice.rate], { stdio: 'inherit' })
      duration = await probe()
      validateWords(JSON.parse(await fs.readFile(wordsFile, 'utf8')), text, duration)
      await fs.writeFile(stamp, signature)
    }
    const maximum = scene.duration - scene.offset - 0.18
    if (!Number.isFinite(duration) || duration <= 0 || duration > maximum) {
      errors.push(`${locale}/${format}/${scene.id} 配音 ${duration.toFixed(2)}s 超出镜头余量 ${maximum.toFixed(2)}s，请精简文案。`)
      continue
    }
    const words = JSON.parse(await fs.readFile(wordsFile, 'utf8'))
    const display = script.captions.join(locale === 'en' ? ' ' : '')
    validateWords(words, display, duration)
    manifest.push({ id: scene.id, duration, start: scene.from + scene.offset, text: display, captions: script.captions, words })
    console.log(`${locale}/${format}/${scene.id}: ${duration.toFixed(2)}s / ${maximum.toFixed(2)}s`)
  }
  if (manifest.length !== films[format].scenes.length) {
    continue
  }
  await fs.writeFile(path.join(audioDir, locale, format, 'voice.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}
if (errors.length) {
  throw new Error(errors.join('\n'))
}
