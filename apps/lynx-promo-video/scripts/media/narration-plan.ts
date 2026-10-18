import type { PromoLocale } from '../../src/config'
import type { ParsedSubtitleCue } from './subtitles'
import { parseSubtitleCues, serializeSubtitles } from './subtitles'

export interface NarrationSentence {
  text: string
  startSeconds: number
}

export interface NarrationPart {
  durationSeconds: number
  subtitles: string
}

export interface SentenceAssembly {
  cues: ParsedSubtitleCue[]
  trims: { startSeconds: number, endSeconds: number, delayMilliseconds: number }[]
  durationSeconds: number
}

/** 操作画面内的逐句起点，留出保存、构建及查看结果的真实间隔。 */
export function getClassnameNarrationPlan(locale: PromoLocale): readonly NarrationSentence[] {
  return locale === 'zh'
    ? [
        { text: '先改间距和圆角。', startSeconds: 0.1 },
        { text: '保存，构建，重新加载。', startSeconds: 5.1 },
        { text: '间距更宽松，头像圆角更明显。', startSeconds: 8.1 },
        { text: '再把蓝色改成绿色。', startSeconds: 15.1 },
        { text: '保存，构建，重新加载。', startSeconds: 20.1 },
        { text: '原生背景变成绿色。', startSeconds: 23.1 },
      ]
    : [
        { text: 'Change the padding and radius.', startSeconds: 0.1 },
        { text: 'Save, build, and reload.', startSeconds: 5.1 },
        { text: 'More space. Rounder photo corners.', startSeconds: 8.1 },
        { text: 'Now change blue to green.', startSeconds: 15.1 },
        { text: 'Save, build, and reload.', startSeconds: 20.1 },
        { text: 'The native card is green.', startSeconds: 23.1 },
      ]
}

export function parseNarrationSelection(args: readonly string[], availableScenes: readonly string[]) {
  const positional = args[0] && !args[0].startsWith('--') ? args[0] : 'all'
  const remaining = positional === args[0] ? args.slice(1) : args
  if (!['zh', 'en', 'all'].includes(positional)) {
    throw new Error(`Unsupported locale: ${positional}. Use zh, en, or all.`)
  }
  if (remaining.length !== 0 && (remaining.length !== 2 || remaining[0] !== '--scene' || !availableScenes.includes(remaining[1]))) {
    throw new Error(`Use --scene with one of: ${availableScenes.join(', ')}.`)
  }
  const locales: PromoLocale[] = positional === 'all' ? ['zh', 'en'] : [positional as PromoLocale]
  return { locales, sceneIds: remaining.length === 2 ? [remaining[1]] : [...availableScenes] }
}

/** 去掉 TTS 的开头静默，将音频和字幕一起移动到指定操作起点。 */
export function assembleSentenceNarration(plan: readonly NarrationSentence[], parts: readonly NarrationPart[], maximumSeconds: number): SentenceAssembly {
  if (plan.length === 0 || plan.length !== parts.length || !Number.isFinite(maximumSeconds) || maximumSeconds <= 0) {
    throw new Error('逐句旁白计划与素材数量或场景时长无效。')
  }
  const cues: ParsedSubtitleCue[] = []
  const trims: SentenceAssembly['trims'] = []
  let durationSeconds = 0
  for (const [index, sentence] of plan.entries()) {
    const part = parts[index]
    const nextStart = plan[index + 1]?.startSeconds ?? maximumSeconds
    if (!sentence.text.trim() || !Number.isFinite(sentence.startSeconds) || sentence.startSeconds < 0 || nextStart <= sentence.startSeconds || nextStart > maximumSeconds) {
      throw new Error('逐句旁白起点必须按顺序位于场景内。')
    }
    const parsed = parseSubtitleCues(part.subtitles)
    const first = parsed[0].startSeconds
    const last = parsed.at(-1)!.endSeconds
    if (!Number.isFinite(part.durationSeconds) || last > part.durationSeconds + 0.05 || last - first + sentence.startSeconds > nextStart + 0.001) {
      throw new Error(`第 ${index + 1} 句旁白超出音频、下一句起点或场景。`)
    }
    for (const cue of parsed) {
      cues.push({ ...cue, startSeconds: cue.startSeconds - first + sentence.startSeconds, endSeconds: cue.endSeconds - first + sentence.startSeconds })
    }
    // 只缩短句尾静默，保留所有实际字幕时间及最多 0.1 秒自然尾音。
    const endSeconds = Math.min(part.durationSeconds, last + 0.1, first + nextStart - sentence.startSeconds)
    trims.push({ startSeconds: first, endSeconds, delayMilliseconds: Math.round(sentence.startSeconds * 1000) })
    durationSeconds = sentence.startSeconds + endSeconds - first
  }
  return { cues, trims, durationSeconds }
}

export function serializeSentenceNarration(assembly: SentenceAssembly) {
  return serializeSubtitles(assembly.cues.map(cue => ({ sceneId: 'classname', from: Math.round(cue.startSeconds * 1000), to: Math.round(cue.endSeconds * 1000), text: cue.text })), 1000, 'vtt')
}

export function sentenceAudioArguments(inputs: readonly string[], output: string, assembly: SentenceAssembly) {
  if (inputs.length !== assembly.trims.length || inputs.length === 0) {
    throw new Error('逐句旁白音频输入与拼接计划数量不一致。')
  }
  const filters = assembly.trims.map((trim, index) => `[${index}:a]atrim=start=${trim.startSeconds}:end=${trim.endSeconds},asetpts=PTS-STARTPTS,adelay=${trim.delayMilliseconds}:all=1[part${index}]`)
  filters.push(`${inputs.map((_, index) => `[part${index}]`).join('')}amix=inputs=${inputs.length}:duration=longest:normalize=0[out]`)
  return ['-y', ...inputs.flatMap(input => ['-i', input]), '-filter_complex', filters.join(';'), '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '48000', '-ac', '1', output]
}
