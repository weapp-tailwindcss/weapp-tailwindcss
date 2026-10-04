import type { Voice } from './audio/subtitles'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { films } from '../src/config'
import { motionMarkers } from '../src/content/narration'
import { beatTimes, createCues, serializeCues } from './audio/subtitles'
import { appRoot, audioDir, outputDir } from './paths'
import { selection } from './selection'

const timingFile = path.join(appRoot, 'src', 'generated', 'timing.json')
const timing: Record<string, Record<string, Record<string, number[]>>> = JSON.parse(await fs.readFile(timingFile, 'utf8').catch(() => '{}'))
const generatedFile = path.join(appRoot, 'src', 'generated', 'subtitles.json')
const previous: Record<string, Record<string, ReturnType<typeof createCues>>> = JSON.parse(await fs.readFile(generatedFile, 'utf8').catch(() => '{}'))
const subtitles: Record<string, Record<string, ReturnType<typeof createCues>>> = Object.fromEntries(Object.entries(previous).filter(([key]) => key === 'zh' || key === 'en'))
await fs.mkdir(outputDir, { recursive: true })
for (const { locale, format } of selection(process.argv.slice(2)).variants) {
  const directory = path.join(audioDir, locale, format)
  const voices: Voice[] = JSON.parse(await fs.readFile(path.join(directory, 'voice.json'), 'utf8'))
  const inputs = ['-i', path.join(directory, 'music.wav')]
  const filters: string[] = []
  const labels = ['[music]']
  voices.forEach((voice, i) => {
    inputs.push('-i', path.join(directory, 'voice', `${voice.id}.mp3`))
    filters.push(`[${i + 1}:a]loudnorm=I=-18:TP=-2:LRA=9,aresample=48000,adelay=${Math.round(voice.start * 1000)}:all=1[v${i}]`)
    labels.push(`[v${i}]`)
  })
  const duck = voices.map(voice => `min(1,max(0,(t-${voice.start - 0.15})/0.15))*min(1,max(0,(${voice.start + voice.duration + 0.2}-t)/0.2))`).join('+')
  filters.push(`[0:a]volume='0.43-0.24*min(1,${duck})':eval=frame[music]`)
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,atrim=duration=${films[format].seconds}[mixed]`)
  const mixFile = path.join(directory, 'mix.wav')
  await execa('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '[mixed]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', mixFile])
  const first = await execa('ffmpeg', ['-hide_banner', '-i', mixFile, '-af', 'loudnorm=I=-16:TP=-1.2:LRA=9:print_format=json', '-f', 'null', '-'])
  const measurement = first.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0]
  if (!measurement) {
    throw new Error('响度测量没有返回 JSON')
  }
  const stats = JSON.parse(measurement)
  const filter = `loudnorm=I=-16:TP=-1.2:LRA=9:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`
  await execa('ffmpeg', ['-v', 'error', '-y', '-i', mixFile, '-af', filter, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', path.join(directory, 'master.wav')])
  timing[locale] ??= {}
  timing[locale][format] = Object.fromEntries(voices.map((voice) => {
    const scene = films[format].scenes.find(scene => scene.id === voice.id)!
    return [voice.id, beatTimes(voice, motionMarkers[locale][format][scene.id] ?? [], scene.offset)]
  }))
  subtitles[locale] ??= {}
  subtitles[locale][format] = createCues(voices, locale)
  const sourceDir = path.join(appRoot, 'subtitles', locale)
  const targetDir = path.join(outputDir, locale)
  await fs.mkdir(sourceDir, { recursive: true })
  await fs.mkdir(targetDir, { recursive: true })
  for (const extension of ['srt', 'vtt']) {
    const text = serializeCues(subtitles[locale][format], extension === 'srt')
    await fs.writeFile(path.join(sourceDir, `weapp-tailwindcss-${format}.${extension}`), text)
    await fs.writeFile(path.join(targetDir, `weapp-tailwindcss-${format}.${extension}`), text)
  }
  console.log(`${locale}/${format}: 混音、响度归一与字幕完成。`)
}
await fs.mkdir(path.join(appRoot, 'src', 'generated'), { recursive: true })
await fs.writeFile(path.join(appRoot, 'src', 'generated', 'subtitles.json'), `${JSON.stringify(subtitles, null, 2)}\n`)
await fs.writeFile(timingFile, `${JSON.stringify(timing, null, 2)}\n`)
