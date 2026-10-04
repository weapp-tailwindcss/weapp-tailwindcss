import { describe, expect, it } from 'vitest'
import { beatTimes, canonicalText, createCues, serializeCues, timestamp, validateWords, wrapCaption } from './subtitles'

describe('词级字幕对齐', () => {
  it('字幕使用真实语音边界，保留短语之间的停顿', () => {
    const cues = createCues([{ id: 'example', duration: 4, start: 10.5, text: 'Tailwind CSS 4，开始构建。', words: [
      { text: 'Tailwind', start: 0.1, end: 0.6 },
      { text: 'CSS', start: 0.7, end: 1.1 },
      { text: '四', start: 1.2, end: 1.4 },
      { text: '开始', start: 2.1, end: 2.5 },
      { text: '构建', start: 2.6, end: 3.1 },
    ] }])
    expect(cues).toEqual([{ start: 10.6, end: 11.9, text: 'Tailwind CSS 4' }, { start: 12.6, end: 13.6, text: '开始构建' }])
    expect(cues[1].start - cues[0].end).toBeCloseTo(0.7)
  })
  it('品牌连字符、大小写和发音数字不会破坏对齐', () => {
    expect(canonicalText('weapp-tailwindcss')).toBe(canonicalText('weapp Tailwind CSS'))
    expect(canonicalText('uni-app x、Mpx')).toBe(canonicalText('uni app x、M P X'))
    expect(canonicalText('CSS 4')).toBe(canonicalText('CSS 四'))
  })
  it('文本不匹配时明确报错，不用估算时间掩盖缺失边界', () => {
    expect(() => createCues([{ id: 'bad', duration: 2, start: 0, text: '开始', words: [{ text: '结束', start: 0, end: 1 }] }])).toThrow('不一致')
  })
  it('时间戳正确进位并分别输出 SRT/VTT', () => {
    expect(timestamp(59.9996)).toBe('00:01:00.000')
    expect(timestamp(3600.001, true)).toBe('01:00:00,001')
    const cues = [{ start: 0.25, end: 1.8, text: '开始构建' }]
    expect(serializeCues(cues, true)).toContain('1\n00:00:00,250 --> 00:00:01,800\n开始构建')
    expect(serializeCues(cues, false)).toContain('WEBVTT\n\n00:00:00.250 --> 00:00:01.800')
  })
})

describe('英文字幕', () => {
  it('英文按实际词边界断句，并保留品牌拼写', () => {
    const cues = createCues([{ id: 'en', duration: 4, start: 5, text: 'Use Tailwind CSS 4. Start building.', captions: ['Use Tailwind CSS 4.', 'Start building.'], words: [
      { text: 'Use', start: 0, end: 0.2 },
      { text: 'Tailwind', start: 0.2, end: 0.6 },
      { text: 'CSS', start: 0.6, end: 1 },
      { text: 'four', start: 1, end: 1.4 },
      { text: 'Start', start: 2, end: 2.4 },
      { text: 'building', start: 2.4, end: 3 },
    ] }], 'en')
    expect(cues).toEqual([{ start: 5, end: 6.4, text: 'Use Tailwind CSS 4.' }, { start: 7, end: 8, text: 'Start building.' }])
    expect(canonicalText('before')).toBe('before')
    expect(canonicalText('Don\'t use uni-app')).toBe(canonicalText('Don’t use uni app'))
  })
  it('按单词换行，长字幕拒绝挤入画面', () => {
    expect(wrapCaption('Reach native ecosystems with uni-app x,', 'en')).toContain('uni-app')
    expect(wrapCaption('Framework integrations with familiar build tools', 'en').split('\n')).toHaveLength(2)
    expect(() => wrapCaption('Build '.repeat(25), 'en')).toThrow('两行')
  })
  it('两行英文均衡断行，避免实际旁白的产品名尾字孤立', () => {
    expect(wrapCaption('Reach native ecosystems with uni-app x,', 'en')).toBe('Reach native ecosystems\nwith uni-app x,')
  })
  it('词边界乱序、越界或缺失时阻断', () => {
    for (const word of [{ text: 'Build', start: -1, end: 1 }, { text: 'Build', start: 2, end: 1 }, { text: 'Build', start: 0, end: Infinity }, { text: 'Build', start: 0, end: 5 }]) {
      expect(() => validateWords([word], 'Build', 4)).toThrow()
    }
    expect(() => validateWords([], 'Build')).toThrow()
  })
})

it('镜头内部切换跟随当前语言配音的实际关键词', () => {
  const voice = { id: 'craft', start: 3, duration: 4, text: 'Spacing, corners, color.', words: [{ text: 'Spacing', start: 0.1, end: 0.8 }, { text: 'corners', start: 1.4, end: 2 }, { text: 'color', start: 2.8, end: 3.5 }] }
  expect(beatTimes(voice, ['corners', 'color'], 0.12)).toEqual([0, 1.52, 2.92])
  expect(() => beatTimes(voice, ['missing'], 0)).toThrow('关键词缺失')
})
