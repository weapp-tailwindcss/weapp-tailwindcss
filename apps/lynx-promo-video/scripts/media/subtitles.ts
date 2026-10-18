export interface SubtitleCue {
  sceneId: string
  from: number
  to: number
  text: string
}

export interface SubtitleScene {
  id: string
  from: number
  duration: number
}

export interface ParsedSubtitleCue {
  startSeconds: number
  endSeconds: number
  text: string
}

function timestampSeconds(value: string) {
  const fields = value.replace(',', '.').split(':').map(Number)
  if (fields.length === 2) {
    fields.unshift(0)
  }
  if (fields[1] >= 60 || fields[2] >= 60) {
    throw new Error(`无效字幕时间戳：${value}`)
  }
  return fields[0] * 3600 + fields[1] * 60 + fields[2]
}

/** edge-tts 的 .vtt 可能使用 SRT 编号和逗号时间戳，两种格式均保留实际句子边界。 */
export function parseSubtitleCues(content: string): ParsedSubtitleCue[] {
  const cues: ParsedSubtitleCue[] = []
  for (const block of content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split(/\n[\t ]*\n/)) {
    const lines = block.trim().split(/\r?\n/)
    const timestampIndex = lines.findIndex(line => line.includes('-->'))
    if (timestampIndex < 0) {
      continue
    }
    const match = /^((?:\d{2,}:)?\d{2}:\d{2}[,.]\d{3})\s+-->\s+((?:\d{2,}:)?\d{2}:\d{2}[,.]\d{3})(?:$|\s)/.exec(lines[timestampIndex])
    if (!match) {
      throw new Error(`无效字幕时间行：${lines[timestampIndex]}`)
    }
    const startSeconds = timestampSeconds(match[1])
    const endSeconds = timestampSeconds(match[2])
    const text = lines.slice(timestampIndex + 1).join(' ').replace(/\s+/g, ' ').trim()
    if (!text || endSeconds <= startSeconds || startSeconds < (cues.at(-1)?.startSeconds ?? 0)) {
      throw new Error('旁白字幕包含空句、倒序或无效时间区间。')
    }
    cues.push({ startSeconds, endSeconds, text })
  }
  if (cues.length === 0) {
    throw new Error('缺少逐句旁白字幕。')
  }
  return cues
}

/** 每场旁白从场景首帧播放，字幕使用相同偏移；末句保留到场景结束前 0.2 秒。 */
export function assembleSubtitleCues(scenes: readonly SubtitleScene[], fps: number, narration: Record<string, string>): SubtitleCue[] {
  return scenes.flatMap((scene) => {
    const parsed = parseSubtitleCues(narration[scene.id] ?? '')
    const lastFrame = scene.from + scene.duration - Math.round(0.2 * fps)
    return parsed.map((cue, index) => {
      const from = scene.from + Math.round(cue.startSeconds * fps)
      const nextStart = parsed[index + 1]?.startSeconds
      const to = index === parsed.length - 1
        ? lastFrame
        : Math.min(scene.from + Math.round(cue.endSeconds * fps), scene.from + Math.round(nextStart! * fps))
      if (cue.endSeconds > scene.duration / fps - 0.2 + 1 / fps || from < scene.from || to <= from || to > lastFrame) {
        throw new Error(`${scene.id} 旁白字幕超出场景时间。`)
      }
      return { sceneId: scene.id, from, to, text: cue.text }
    })
  })
}

function timestamp(frame: number, fps: number, separator: string) {
  const milliseconds = Math.round(frame / fps * 1000)
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor(milliseconds % 3_600_000 / 60_000)
  const seconds = Math.floor(milliseconds % 60_000 / 1000)
  const millis = milliseconds % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${separator}${String(millis).padStart(3, '0')}`
}

export function serializeSubtitles(cues: readonly SubtitleCue[], fps: number, format: 'srt' | 'vtt') {
  const entries = cues.map((cue, index) => {
    const separator = format === 'srt' ? ',' : '.'
    const prefix = format === 'srt' ? `${index + 1}\n` : ''
    return `${prefix}${timestamp(cue.from, fps, separator)} --> ${timestamp(cue.to, fps, separator)}\n${cue.text}\n`
  }).join('\n')
  return format === 'vtt' ? `WEBVTT\n\n${entries}` : entries
}
