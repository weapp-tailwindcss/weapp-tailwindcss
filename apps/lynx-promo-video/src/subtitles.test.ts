import { describe, expect, it } from 'vitest'
import { createAmbientWav } from '../scripts/generate-ambient'
import { assembleSubtitleCues, parseSubtitleCues, serializeSubtitles } from '../scripts/media/subtitles'
import { verifySubtitleTimeline } from '../scripts/media/timeline'

const scenes = [
  { id: 'intro', from: 0, duration: 150 },
  { id: 'edit', from: 150, duration: 240 },
]
const narration = {
  intro: '1\n00:00:00,100 --> 00:00:02,000\nFirst sentence.\n\n2\n00:00:01,950 --> 00:00:03,400\nSecond sentence.\n',
  edit: 'WEBVTT\n\n00:00:00.100 --> 00:00:04.000\nEdit and build.\n',
}

describe('sentence subtitles', () => {
  it('parses both real edge-tts SRT timestamps and standard VTT', () => {
    expect(parseSubtitleCues(narration.intro)).toEqual([
      { startSeconds: 0.1, endSeconds: 2, text: 'First sentence.' },
      { startSeconds: 1.95, endSeconds: 3.4, text: 'Second sentence.' },
    ])
    expect(parseSubtitleCues(narration.edit)[0].text).toBe('Edit and build.')
    expect(() => parseSubtitleCues('WEBVTT\n\n')).toThrow('缺少逐句')
    expect(() => parseSubtitleCues('00:00:00,100 --> 00:00:01,000')).toThrow('空句')
  })

  it('keeps actual sentence times and removes TTS overlap without extending the final sentence', () => {
    const cues = assembleSubtitleCues(scenes, 30, narration)
    expect(cues.map(cue => [cue.from, cue.to])).toEqual([[3, 59], [59, 102], [153, 270]])
    expect(cues.map(cue => cue.text)).toEqual(['First sentence.', 'Second sentence.', 'Edit and build.'])
    expect(() => assembleSubtitleCues([{ id: 'intro', from: 0, duration: 60 }], 30, narration)).toThrow('超出场景')
  })

  it('preserves real gaps and scene endings after narration finishes', () => {
    const cues = assembleSubtitleCues([{ id: 'edit', from: 390, duration: 900 }], 30, {
      edit: 'WEBVTT\n\n00:00:00.100 --> 00:00:01.500\nFirst.\n\n00:00:15.100 --> 00:00:18.000\nSecond.\n',
    })
    expect(cues.map(cue => [cue.from, cue.to])).toEqual([[393, 435], [843, 930]])
    expect(() => verifySubtitleTimeline(serializeSubtitles(cues, 30, 'vtt'), [{ id: 'edit', from: 390, duration: 900 }], 30, 43, cues)).not.toThrow()
    const extended = [{ ...cues[0], to: cues[1].from }, { ...cues[1], to: 1284 }]
    expect(() => verifySubtitleTimeline(serializeSubtitles(extended, 30, 'vtt'), [{ id: 'edit', from: 390, duration: 900 }], 30, 43, cues)).toThrow('实际旁白')
  })

  it('exports multiple cues per scene and validates their actual narration alignment', () => {
    const cues = assembleSubtitleCues(scenes, 30, narration)
    for (const format of ['srt', 'vtt'] as const) {
      const content = serializeSubtitles(cues, 30, format)
      expect(() => verifySubtitleTimeline(content, scenes, 30, 13, cues)).not.toThrow()
      expect(() => verifySubtitleTimeline(content.replace('Second sentence.', 'Unrecorded sentence.'), scenes, 30, 13, cues)).toThrow('实际旁白')
      expect(() => verifySubtitleTimeline(content.replace(/00:00:00[,.]100/, '00:00:00.133'), scenes, 30, 13, cues)).toThrow('实际旁白')
    }
  })

  it('rejects missing scenes, overlaps and cues crossing a scene boundary', () => {
    const cues = assembleSubtitleCues(scenes, 30, narration)
    expect(() => verifySubtitleTimeline(serializeSubtitles(cues.slice(0, 2), 30, 'srt'), scenes, 30, 13)).toThrow('edit 场景')
    const overlap = [{ ...cues[0], to: 80 }, ...cues.slice(1)]
    expect(() => verifySubtitleTimeline(serializeSubtitles(overlap, 30, 'srt'), scenes, 30, 13)).toThrow('重叠')
    const crossScene = [{ ...cues[0], to: 151 }, ...cues.slice(1)]
    expect(() => verifySubtitleTimeline(serializeSubtitles(crossScene, 30, 'srt'), scenes, 30, 13)).toThrow('越界')
  })
})

describe('ambient timeline', () => {
  it('produces a complete 75-second stereo PCM track with a silent ending', () => {
    const buffer = createAmbientWav(75)
    expect(buffer.subarray(0, 4).toString()).toBe('RIFF')
    const dataSize = buffer.readUInt32LE(40)
    const bytesPerSecond = buffer.readUInt32LE(28)
    expect(buffer.readUInt32LE(24)).toBe(48_000)
    expect(buffer.readUInt16LE(22)).toBe(2)
    expect(dataSize / bytesPerSecond).toBe(75)
    expect(buffer.length).toBe(dataSize + 44)
    expect(buffer.readInt16LE(buffer.length - 4)).toBe(0)
    expect(() => createAmbientWav(0)).toThrow('时长必须大于零')
  })
})
