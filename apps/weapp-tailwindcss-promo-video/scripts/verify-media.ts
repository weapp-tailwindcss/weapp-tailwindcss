import type { Buffer } from 'node:buffer'
import type { Cue, Voice } from './audio/subtitles'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { films, FPS } from '../src/config'
import { motionMarkers, scriptFor } from '../src/content/narration'
import { beatTimes, createCues, serializeCues } from './audio/subtitles'
import { appRoot, audioDir, outputDir } from './paths'
import { selection } from './selection'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function checkFaststart(data: Buffer) {
  const atoms: Array<{ type: string, at: number }> = []
  let at = 0
  while (at + 8 <= data.length) {
    const size32 = data.readUInt32BE(at)
    const size = size32 === 1 ? Number(data.readBigUInt64BE(at + 8)) : size32 === 0 ? data.length - at : size32
    if (size < 8 || at + size > data.length) {
      throw new Error('MP4 atom 结构不完整')
    }
    atoms.push({ type: data.toString('ascii', at + 4, at + 8), at })
    at += size
  }
  const moov = atoms.find(atom => atom.type === 'moov')
  const mdat = atoms.find(atom => atom.type === 'mdat')
  assert(moov && mdat && moov.at < mdat.at, 'MP4 未启用 faststart')
}

const reports: Array<{ locale: string, format: string } & Record<string, string | number | boolean>> = []
const timing: Record<string, Record<string, Record<string, number[]>>> = JSON.parse(await fs.readFile(path.join(appRoot, 'src', 'generated', 'timing.json'), 'utf8'))
const generated: Record<string, Record<string, Cue[]>> = JSON.parse(await fs.readFile(path.join(appRoot, 'src', 'generated', 'subtitles.json'), 'utf8'))
for (const { locale, format } of selection(process.argv.slice(2)).variants) {
  const targetDir = path.join(outputDir, locale)
  const film = films[format]
  const file = path.join(targetDir, `weapp-tailwindcss-${format}.mp4`)
  const { stdout } = await execa('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])
  const media = JSON.parse(stdout)
  const video = media.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video')
  const audio = media.streams.find((stream: { codec_type: string }) => stream.codec_type === 'audio')
  assert(video?.width === film.width && video?.height === film.height && video?.codec_name === 'h264' && video?.pix_fmt === 'yuv420p' && video?.color_space === 'bt709', `${format} 视频格式错误`)
  assert(video.avg_frame_rate === '30/1' && Number(video.nb_frames) === film.seconds * FPS, `${format} 帧率或帧数错误`)
  assert(audio?.codec_name === 'aac' && audio?.sample_rate === '48000' && audio?.channels === 2, `${format} 音频格式错误`)
  assert(Math.abs(Number(media.format.duration) - film.seconds) <= 0.1, `${format} 容器时长超限`)
  checkFaststart(await fs.readFile(file))
  const cover = await fs.readFile(path.join(targetDir, `weapp-tailwindcss-${format}-cover.png`))
  assert(cover.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && cover.readUInt32BE(16) === film.width && cover.readUInt32BE(20) === film.height, `${format} 封面尺寸错误`)
  const voices: Voice[] = JSON.parse(await fs.readFile(path.join(audioDir, locale, format, 'voice.json'), 'utf8'))
  assert(voices.length === film.scenes.length, `${format} 配音缺失`)
  for (const scene of film.scenes) {
    const voice = voices.find(item => item.id === scene.id)
    assert(voice && voice.start >= scene.from && voice.start + voice.duration <= scene.from + scene.duration - 0.15, `${format}/${scene.id} 配音越界`)
    const script = scriptFor(locale, format, scene.id)
    assert(voice.text === script.captions.join(locale === 'en' ? ' ' : '') && JSON.stringify(voice.captions) === JSON.stringify(script.captions), '配音文案过期')
    assert(Math.abs(voice.start - scene.from - scene.offset) < 0.001, '配音起点过期')
    assert(JSON.stringify(timing[locale]?.[format]?.[scene.id]) === JSON.stringify(beatTimes(voice, motionMarkers[locale][format][scene.id] ?? [], scene.offset)), '动效词边界过期')
    assert(voice.words.length > 0, `${format}/${scene.id} 缺少词级时间戳`)
  }
  const cues = createCues(voices, locale)
  assert(JSON.stringify(cues) === JSON.stringify(generated[locale]?.[format]), `${format} 画面字幕过期`)
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]
    assert(cue.start >= (cues[i - 1]?.end ?? 0) && cue.end > cue.start && cue.end <= film.seconds, `${format} 字幕时间非法`)
  }
  for (const extension of ['srt', 'vtt']) {
    const expected = serializeCues(cues, extension === 'srt')
    for (const directory of [path.join(appRoot, 'subtitles', locale), targetDir]) {
      assert(await fs.readFile(path.join(directory, `weapp-tailwindcss-${format}.${extension}`), 'utf8') === expected, `${format} 导出字幕过期`)
    }
  }
  const decode = await execa('ffmpeg', ['-hide_banner', '-v', 'info', '-xerror', '-i', file, '-vf', 'blackdetect=d=0.1:pix_th=0.01:pic_th=0.995', '-af', 'loudnorm=I=-16:TP=-1:LRA=9:print_format=json', '-f', 'null', '-'])
  assert(!decode.stderr.includes('black_start:'), `${format} 存在黑帧片段`)
  const match = decode.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0]
  assert(match, `${format} 响度报告缺失`)
  const loudness = JSON.parse(match)
  assert(Math.abs(Number(loudness.input_i) + 16) <= 1, `${format} 响度不在 −16±1 LUFS`)
  assert(Number(loudness.input_tp) <= -1, `${format} 真峰值超出 −1 dBTP`)
  reports.push({ locale, format, width: film.width, height: film.height, frames: Number(video.nb_frames), fps: video.avg_frame_rate, seconds: Number(media.format.duration), video: video.codec_name, pixelFormat: video.pix_fmt, colorSpace: video.color_space, audio: audio.codec_name, sampleRate: Number(audio.sample_rate), channels: audio.channels, lufs: Number(loudness.input_i), truePeakDb: Number(loudness.input_tp), faststart: true, fullDecode: true, subtitleCues: cues.length, bytes: Number(media.format.size) })
}
const reportPath = path.join(outputDir, 'verification-bilingual.json')
const previous = JSON.parse(await fs.readFile(reportPath, 'utf8').catch(() => '[]')) as typeof reports
const combined = [...previous.filter(old => !reports.some(report => report.locale === old.locale && report.format === old.format)), ...reports]
await fs.writeFile(reportPath, `${JSON.stringify(combined, null, 2)}\n`)
console.log(JSON.stringify(reports, null, 2))
