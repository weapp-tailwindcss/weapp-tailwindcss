import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { assembleSentenceNarration, getClassnameNarrationPlan, parseNarrationSelection, sentenceAudioArguments, serializeSentenceNarration } from '../scripts/media/narration-plan'
import { parseSubtitleCues } from '../scripts/media/subtitles'

const part = {
  durationSeconds: 1.5,
  subtitles: 'WEBVTT\n\n00:00:00.100 --> 00:00:00.900\nRecorded sentence.\n',
}
const plan = [{ text: 'First.', startSeconds: 0.1 }, { text: 'Second.', startSeconds: 2.2 }]

describe('operation narration plan', () => {
  it('uses the approved Chinese sentences and separate operation starts in both languages', () => {
    expect(getClassnameNarrationPlan('zh')).toEqual([
      { text: '在真实编辑器里修改状态卡。', startSeconds: 0.1 },
      { text: '先调整间距和圆角。', startSeconds: 3.2 },
      { text: '保存并构建，查看原生结果。', startSeconds: 9.1 },
      { text: '再修改背景色，重新构建并查看变化。', startSeconds: 15.1 },
    ])
    expect(getClassnameNarrationPlan('en').map(sentence => sentence.startSeconds)).toEqual([0.1, 2.2, 9.1, 15.1, 23.1])
    expect(getClassnameNarrationPlan('en')[3].text).toBe('Then change the background color and build again.')
  })

  it('selects only the requested scene without changing scene numbering or other languages', () => {
    const scenes = ['hook', 'config', 'classname']
    expect(parseNarrationSelection(['all', '--scene', 'classname'], scenes)).toEqual({ locales: ['zh', 'en'], sceneIds: ['classname'] })
    expect(parseNarrationSelection(['--scene', 'classname'], scenes)).toEqual({ locales: ['zh', 'en'], sceneIds: ['classname'] })
    expect(parseNarrationSelection(['zh'], scenes)).toEqual({ locales: ['zh'], sceneIds: scenes })
    expect(() => parseNarrationSelection(['en', '--scene', 'typo'], scenes)).toThrow('--scene')
    expect(() => parseNarrationSelection(['en', '--scene'], scenes)).toThrow('--scene')
    expect(() => parseNarrationSelection(['de'], scenes)).toThrow('locale')
  })

  it('moves audio and subtitles together while keeping genuine silence between sentences', () => {
    const assembly = assembleSentenceNarration(plan, [part, part], 29.8)
    expect(assembly.trims).toEqual([
      { startSeconds: 0.1, endSeconds: 1, delayMilliseconds: 100 },
      { startSeconds: 0.1, endSeconds: 1, delayMilliseconds: 2200 },
    ])
    expect(parseSubtitleCues(serializeSentenceNarration(assembly))).toEqual([
      { startSeconds: 0.1, endSeconds: 0.9, text: 'Recorded sentence.' },
      { startSeconds: 2.2, endSeconds: 3, text: 'Recorded sentence.' },
    ])
    expect(assembly.durationSeconds).toBeCloseTo(3.1)
  })

  it('rejects speech that exceeds the next operation, scene or source audio', () => {
    expect(() => assembleSentenceNarration(plan, [part], 29.8)).toThrow('数量')
    expect(() => assembleSentenceNarration(plan, [part, part], 2.8)).toThrow('超出')
    expect(() => assembleSentenceNarration([{ text: 'First.', startSeconds: 0.1 }, { text: 'Second.', startSeconds: 0.5 }], [part, part], 29.8)).toThrow('超出')
    expect(() => assembleSentenceNarration(plan, [{ ...part, durationSeconds: 0.5 }, part], 29.8)).toThrow('超出音频')
    expect(() => assembleSentenceNarration([{ text: 'First.', startSeconds: 2.2 }, { text: 'Second.', startSeconds: 0.1 }], [part, part], 29.8)).toThrow('按顺序')
  })

  it('preserves input paths as separate arguments for all supported path forms', () => {
    const assembly = assembleSentenceNarration(plan, [part, part], 29.8)
    const inputs = ['C:\\recordings with spaces\\01.mp3', './audio/second.mp3']
    const args = sentenceAudioArguments(inputs, '/recordings/output.mp3', assembly)
    expect(args.slice(0, 5)).toEqual(['-y', '-i', inputs[0], '-i', inputs[1]])
    expect(args.at(-1)).toBe('/recordings/output.mp3')
    expect(() => sentenceAudioArguments([], 'output.mp3', assembly)).toThrow('数量')
  })

  it('renders scheduled audio with audible sentences and an actual silent gap', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx narration '))
    try {
      const input = path.join(directory, 'source.wav')
      const output = path.join(directory, 'scheduled.mp3')
      await execa('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1.5', '-y', input])
      const assembly = assembleSentenceNarration(plan, [part, part], 29.8)
      await execa('ffmpeg', sentenceAudioArguments([input, input], output, assembly))
      const decoded = await execa('ffmpeg', ['-v', 'error', '-i', output, '-f', 's16le', '-ar', '48000', '-ac', '1', 'pipe:1'], { encoding: 'buffer' })
      const samples = Buffer.from(decoded.stdout)
      const rms = (start: number, end: number) => {
        let squares = 0
        for (let index = Math.round(start * 48000); index < Math.round(end * 48000); index++) {
          squares += samples.readInt16LE(index * 2) ** 2
        }
        return Math.sqrt(squares / ((end - start) * 48000))
      }
      expect(samples.length / 2 / 48000).toBeCloseTo(3.1, 1)
      expect(rms(0.3, 0.7)).toBeGreaterThan(1000)
      expect(rms(1.2, 2)).toBeLessThan(15)
      expect(rms(2.3, 2.7)).toBeGreaterThan(1000)
    }
    finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  }, 15_000)
})
