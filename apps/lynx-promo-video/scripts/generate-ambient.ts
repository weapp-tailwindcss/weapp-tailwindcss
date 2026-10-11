import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { publicDir } from './paths'

const sampleRate = 48_000
const channels = 2
const seconds = 60
const bytesPerSample = 2
const sampleCount = sampleRate * seconds

function writeWavHeader(buffer: Buffer, dataSize: number) {
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  buffer.writeUInt16LE(channels * bytesPerSample, 32)
  buffer.writeUInt16LE(bytesPerSample * 8, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
}

function envelope(time: number) {
  const attack = Math.min(1, time / 2)
  const release = Math.min(1, (seconds - time) / 2)
  return Math.max(0, Math.min(attack, release))
}

async function main() {
  const audioDir = path.join(publicDir, 'audio')
  await fs.mkdir(audioDir, { recursive: true })
  const dataSize = sampleCount * channels * bytesPerSample
  const buffer = Buffer.allocUnsafe(44 + dataSize)
  writeWavHeader(buffer, dataSize)
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate
    const pulse = 0.54 + 0.46 * Math.sin(Math.PI * 2 * 0.125 * time)
    const signal = (
      Math.sin(Math.PI * 2 * 55 * time) * 0.34
      + Math.sin(Math.PI * 2 * 82.41 * time) * 0.18
      + Math.sin(Math.PI * 2 * 110 * time) * 0.1
    ) * envelope(time) * pulse * 0.16
    const left = Math.max(-1, Math.min(1, signal))
    const right = Math.max(-1, Math.min(1, signal * 0.94))
    const offset = 44 + index * channels * bytesPerSample
    buffer.writeInt16LE(Math.round(left * 32767), offset)
    buffer.writeInt16LE(Math.round(right * 32767), offset + bytesPerSample)
  }
  await fs.writeFile(path.join(audioDir, 'ambient.wav'), buffer)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
