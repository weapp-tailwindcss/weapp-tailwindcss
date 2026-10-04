import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { films } from '../src/config'
import { musicSample } from './audio/synthesis'
import { audioDir } from './paths'
import { selection } from './selection'

const rate = 48_000
for (const { locale, format } of selection(process.argv.slice(2)).variants) {
  const film = films[format]
  const samples = rate * film.seconds
  const buffer = Buffer.alloc(44 + samples * 4)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(buffer.length - 8, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(2, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate * 4, 28)
  buffer.writeUInt16LE(4, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples * 4, 40)
  const transitions = film.scenes.slice(1).map(scene => scene.from)
  for (let index = 0; index < samples; index++) {
    for (let channel = 0; channel < 2; channel++) {
      const value = musicSample(index / rate, index, film.seconds, transitions, channel)
      buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + index * 4 + channel * 2)
    }
  }
  const directory = path.join(audioDir, locale, format)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'music.wav'), buffer)
  console.log(`${locale}/${format}: 原创 120 BPM 配乐与转场音效已生成。`)
}
