import { describe, expect, it } from 'vitest'
import { verifyDevelopmentMetadata, verifyDevelopmentTimeline } from '../scripts/media/timeline'

const scenes = [{ id: 'config', from: 150, duration: 240 }, { id: 'classname', from: 390, duration: 900 }]
const events = [
  { id: 'config', startSeconds: 0, endSeconds: 8, sourceSha256: 'a'.repeat(64), bundleSha256: 'b'.repeat(64) },
  { id: 'workflow', startSeconds: 8, endSeconds: 38, sourceSha256: 'a'.repeat(64), bundleSha256: 'b'.repeat(64) },
]
const clips = [
  { sceneId: 'config', eventId: 'config', startSeconds: 0, endSeconds: 8 },
  { sceneId: 'classname', eventId: 'workflow', startSeconds: 8, endSeconds: 38 },
]

describe('development rendered frame coverage', () => {
  it('rejects a short clip that leaves one black frame at the scene boundary', () => {
    const short = [{ ...clips[0], endSeconds: 7.98 }, clips[1]]
    expect(() => verifyDevelopmentTimeline(events, short, scenes, 30, 38, 100)).toThrow('时长')
  })

  it('rejects a full eight seconds whose individual rounded clips leave a missing frame', () => {
    const boundaries = [0, 2.016333, 4.032666, 6.049, 8]
    const split = boundaries.slice(0, -1).map((startSeconds, index) => ({ ...clips[0], startSeconds, endSeconds: boundaries[index + 1] }))
    expect(() => verifyDevelopmentTimeline(events, [...split, clips[1]], scenes, 30, 38, 100)).toThrow('时长')
  })

  it('accepts exact output frame coverage with adjusted playback speed', () => {
    const slowed = [{ ...clips[0], endSeconds: 4, playbackRate: 0.5 }, clips[1]]
    expect(() => verifyDevelopmentTimeline(events, slowed, scenes, 30, 38, 100)).not.toThrow()
  })
})

describe('development render input identity', () => {
  it('accepts the same generated clips and rejects stale render metadata', () => {
    expect(() => verifyDevelopmentMetadata(JSON.stringify({ clips }), clips)).not.toThrow()
    const stale = [{ ...clips[0], endSeconds: 7 }, clips[1]]
    expect(() => verifyDevelopmentMetadata(JSON.stringify({ clips: stale }), clips)).toThrow('素材清单不一致')
    expect(() => verifyDevelopmentMetadata('{}', clips)).toThrow('素材清单不一致')
  })

  it('rejects different playback speed, order or source event identity', () => {
    const faster = [{ ...clips[0], playbackRate: 2 }, clips[1]]
    const differentEvent = [{ ...clips[0], eventId: 'old-run' }, clips[1]]
    for (const rendered of [faster, [...clips].reverse(), differentEvent]) {
      expect(() => verifyDevelopmentMetadata(JSON.stringify({ clips: rendered }), clips)).toThrow('素材清单不一致')
    }
  })

  it('treats an explicit normal playback speed as the default', () => {
    const rendered = clips.map(clip => ({ ...clip, playbackRate: 1 }))
    expect(() => verifyDevelopmentMetadata(JSON.stringify({ clips: rendered }), clips)).not.toThrow()
  })
})
