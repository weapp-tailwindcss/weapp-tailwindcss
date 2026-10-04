import type { Locale } from '../../src/config'

export interface Cue { start: number, end: number, text: string }
export interface Word { start: number, end: number, text: string }
export interface Voice { id: string, duration: number, start: number, text: string, words: Word[], captions?: string[] }

export function canonicalText(text: string) {
  return text.toLowerCase().replace(/\bfour\b/gu, '4').replaceAll('四', '4').replace(/[^\p{L}\p{N}]/gu, '')
}
export function validateWords(words: Word[], text: string, duration = Infinity) {
  if (!Array.isArray(words) || !words.length || canonicalText(words.map(word => word.text).join(' ')) !== canonicalText(text)) {
    throw new Error('配音文本与词边界不一致')
  }
  let previous = 0
  for (const word of words) {
    if (!word.text || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < previous - 0.001 || word.end <= word.start || word.end > duration + 0.1) {
      throw new Error('语音词边界时间非法')
    }
    previous = word.end
  }
}
export function wrapCaption(text: string, locale: Locale) {
  const clean = text.trim()
  const tokens = locale === 'en' ? clean.split(/\s+/) : clean.match(/\p{Script=Han}|[^\s\p{Script=Han}]+|\s+/gu) ?? []
  const limit = locale === 'en' ? 38 : 21
  const measure = (value: string) => [...value].reduce((sum, char) => sum + (locale === 'en' || /\p{Script=Han}/u.test(char) ? 1 : 0.55), 0)
  const lines: string[] = []
  let line = ''
  for (const token of tokens) {
    const candidate = `${line}${locale === 'en' && line ? ' ' : ''}${token}`
    if (line && measure(candidate) > limit) {
      lines.push(line.trim())
      line = token.trimStart()
    }
    else {
      line = candidate
    }
  }
  if (line) {
    lines.push(line.trim())
  }
  if (lines.length > 2 || lines.some(line => measure(line) > limit)) {
    throw new Error(`字幕超过两行，请精简：${text}`)
  }
  if (locale === 'en' && lines.length === 2) {
    const balanced = tokens
      .slice(1)
      .map((_, index) => [tokens.slice(0, index + 1).join(' '), tokens.slice(index + 1).join(' ')])
      .filter(pair => pair.every(line => measure(line) <= limit))
      .sort((a, b) => Math.abs(measure(a[0]) - measure(a[1])) - Math.abs(measure(b[0]) - measure(b[1])))[0]
    return balanced.join('\n')
  }
  return lines.join('\n')
}
export function createCues(voices: Voice[], locale: Locale = 'zh'): Cue[] {
  return voices.flatMap((voice) => {
    validateWords(voice.words, voice.text, voice.duration)
    const chunks = voice.captions ?? voice.text.match(locale === 'en' ? /[^.!?,]+[.!?,]?/g : /[^，。！？]+[，。！？]?/g) ?? [voice.text]
    if (canonicalText(chunks.join(' ')) !== canonicalText(voice.text)) {
      throw new Error('字幕分段与旁白不一致')
    }
    let position = 0
    const words = voice.words.map((word) => {
      const from = position
      position += canonicalText(word.text).length
      return { ...word, from, to: position }
    })
    let cursor = 0
    return chunks.map((text) => {
      const from = cursor
      cursor += canonicalText(text).length
      const matching = words.filter(word => word.to > from && word.from < cursor)
      if (!matching.length) {
        throw new Error(`${voice.id} 字幕缺少语音边界`)
      }
      return { start: voice.start + matching[0].start, end: voice.start + matching[matching.length - 1].end, text: wrapCaption(text.trim().replace(/[，。]$/, ''), locale) }
    })
  })
}
export function timestamp(seconds: number, srt = false) {
  const milliseconds = Math.round(seconds * 1000)
  const ms = milliseconds % 1000
  const whole = Math.floor(milliseconds / 1000)
  return `${String(Math.floor(whole / 3600)).padStart(2, '0')}:${String(Math.floor(whole / 60) % 60).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}${srt ? ',' : '.'}${String(ms).padStart(3, '0')}`
}
export function serializeCues(cues: Cue[], srt: boolean) {
  return `${srt ? '' : 'WEBVTT\n\n'}${cues.map((cue, i) => `${srt ? `${i + 1}\n` : ''}${timestamp(cue.start, srt)} --> ${timestamp(cue.end, srt)}\n${cue.text}\n`).join('\n')}`
}

export function beatTimes(voice: Voice, markers: string[], offset: number) {
  validateWords(voice.words, voice.text, voice.duration)
  const normalized = voice.words.map(word => canonicalText(word.text)).join('')
  return [0, ...markers.map((marker) => {
    const at = normalized.indexOf(canonicalText(marker))
    if (at < 0) {
      throw new Error(`动效关键词缺失：${marker}`)
    }
    let cursor = 0
    const word = voice.words.find((word) => {
      cursor += canonicalText(word.text).length
      return cursor > at
    })!
    return offset + word.start
  })]
}
