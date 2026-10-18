import type { DevelopmentClip, DevelopmentEvent } from '../capture/manifest'
import type { SubtitleCue } from './subtitles'
import { parseSubtitleCues } from './subtitles'

interface Scene {
  id: string
  from: number
  duration: number
}

export function verifySubtitleTimeline(content: string, scenes: readonly Scene[], fps: number, totalSeconds: number, expectedCues?: readonly SubtitleCue[]) {
  const entries = parseSubtitleCues(content)
  const covered = new Map<string, { start: number, end: number }>()
  let previousEnd = 0
  for (const entry of entries) {
    const { startSeconds: start, endSeconds: end } = entry
    const scene = scenes.find(scene => start >= scene.from / fps && start < (scene.from + scene.duration) / fps)
    if (!scene || start < previousEnd || end > (scene.from + scene.duration) / fps + 0.001 || end > totalSeconds) {
      throw new Error('字幕包含重叠、越界或无效时间。')
    }
    const coverage = covered.get(scene.id)
    covered.set(scene.id, { start: coverage?.start ?? start, end })
    previousEnd = end
  }
  for (const scene of scenes) {
    const coverage = covered.get(scene.id)
    if (!coverage || coverage.start > scene.from / fps + 0.6 || coverage.end < (scene.from + scene.duration) / fps - 1) {
      throw new Error(`字幕未覆盖完整 ${scene.id} 场景。`)
    }
  }
  if (previousEnd < totalSeconds - 1) {
    throw new Error(`字幕未覆盖完整 ${totalSeconds} 秒时间线。`)
  }
  if (expectedCues && (expectedCues.length !== entries.length || entries.some((entry, index) => {
    const expected = expectedCues[index]
    return entry.text !== expected.text || Math.abs(entry.startSeconds - expected.from / fps) > 0.001 || Math.abs(entry.endSeconds - expected.to / fps) > 0.001
  }))) {
    throw new Error('字幕与实际旁白逐句时间或文字不一致。')
  }
}

export function verifyDevelopmentTimeline(events: DevelopmentEvent[], clips: DevelopmentClip[], scenes: readonly Scene[], fps: number, videoSeconds: number, rawSeconds: number) {
  const ids = new Set<string>()
  for (const event of events) {
    if (!event.id || ids.has(event.id)) {
      throw new Error('开发操作必须具有独立且非空的 id。')
    }
    ids.add(event.id)
    verifyRange(event.startSeconds, event.endSeconds, videoSeconds, event.id)
    if (event.rawStartSeconds !== undefined || event.rawEndSeconds !== undefined) {
      verifyRange(event.rawStartSeconds, event.rawEndSeconds, rawSeconds, `${event.id} 原片`)
    }
  }
  let previousClipEnd = 0
  for (const sceneId of ['config', 'classname']) {
    const scene = scenes.find(item => item.id === sceneId)
    const selected = clips.filter(clip => clip.sceneId === sceneId)
    if (!scene || selected.length === 0) {
      throw new Error(`缺少 ${sceneId} 的真实开发剪辑。`)
    }
    let duration = 0
    for (const clip of selected) {
      verifyRange(clip.startSeconds, clip.endSeconds, videoSeconds, clip.sceneId)
      if (clip.startSeconds < previousClipEnd) {
        throw new Error(`${sceneId} 剪辑重复使用或逆序播放开发录像。`)
      }
      previousClipEnd = clip.endSeconds
      const event = events.find(item => item.id === clip.eventId)
      if (!event || clip.startSeconds < event.startSeconds || clip.endSeconds > event.endSeconds) {
        throw new Error(`${sceneId} 剪辑未绑定有效操作区间。`)
      }
      const rate = clip.playbackRate ?? 1
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(`${sceneId} 播放速度必须大于零。`)
      }
      duration += (clip.endSeconds - clip.startSeconds) / rate
    }
    if (Math.abs(duration - scene.duration / fps) > 1 / fps) {
      throw new Error(`${sceneId} 录屏剪辑时长与场景不一致。`)
    }
  }
}

function verifyRange(start: number | undefined, end: number | undefined, maximum: number, label: string) {
  if (start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > maximum + 0.05) {
    throw new Error(`${label} 时间区间必须位于有效的 ${maximum} 秒素材内。`)
  }
}
