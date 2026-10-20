import { expect, it } from 'vitest'
import { naturalStartingTimeline } from './tailwind-capabilities/web-lifecycle/contract'

function timeline(firstTime = 28) {
  // 固定 CI 的首帧观察值，并按独立 0→1 / 1200ms 参考构造时钟夹具。
  return [firstTime, 120, 600, 1200].map(currentTime => ({
    cycle: 1,
    time: 39 + currentTime,
    probe: currentTime === 28 ? 0.023333 : currentTime / 1200,
    control: 1,
    phase: 'rendered' as const,
    animation: {
      identity: 1,
      native: true,
      registered: currentTime < 1200,
      matches: currentTime < 1200 ? 1 : 0,
      target: 'probe',
      targetMatches: true,
      documentTimeline: true,
      property: 'opacity',
      playState: currentTime < 1200 ? 'running' : 'finished',
      pending: false,
      currentTime,
      startTime: 39 as number | null,
      timelineTime: 39 + currentTime,
      duration: 1200,
      delay: 0,
      endDelay: 0,
      iterations: 1,
      iterationStart: 0,
      direction: 'normal',
      easing: 'linear',
      playbackRate: 1,
      keyframes: [{ computedOffset: 0, opacity: '0', easing: 'linear' }, { computedOffset: 1, opacity: '1', easing: 'linear' }],
    },
  }))
}

it('首个 rAF 延迟必须以同帧原生时钟验证 0→1 linear 进度', () => {
  expect(naturalStartingTimeline(timeline(), 1, true)).toBe(true)
})

it.each(['missing-clock', 'wrong-start', 'wrong-end', 'wrong-opacity', 'fast-forward', 'changed-start-time', 'changed-identity', 'wrong-target', 'wrong-property', 'not-native', 'unregistered', 'multiple-transitions', 'wrong-duration', 'delay', 'end-delay', 'iterations', 'iteration-start', 'direction', 'easing', 'keyframe-easing', 'playback-rate', 'reversed-clock', 'pending-again'] as const)('原生自然时间线拒绝 %s', (mutation) => {
  const frames = timeline(0)
  const animation = frames[1]!.animation
  if (mutation === 'missing-clock') {
    Reflect.deleteProperty(frames[1]!, 'animation')
  }
  if (mutation === 'wrong-start') {
    animation.keyframes[0]!.opacity = '0.5'
  }
  if (mutation === 'wrong-end') {
    animation.keyframes[1]!.opacity = '0.5'
  }
  if (mutation === 'wrong-opacity') {
    frames[1]!.probe = 0.5
  }
  if (mutation === 'fast-forward') {
    animation.currentTime = 600
  }
  if (mutation === 'changed-start-time') {
    animation.startTime = 40
  }
  if (mutation === 'changed-identity') {
    animation.identity = 2
  }
  if (mutation === 'wrong-target') {
    animation.target = 'control'
  }
  if (mutation === 'wrong-property') {
    animation.property = 'width'
  }
  if (mutation === 'not-native') {
    animation.native = false
  }
  if (mutation === 'unregistered') {
    animation.registered = false
  }
  if (mutation === 'multiple-transitions') {
    animation.matches = 2
  }
  if (mutation === 'wrong-duration') {
    animation.duration = 2400
  }
  if (mutation === 'delay') {
    animation.delay = 100
  }
  if (mutation === 'end-delay') {
    animation.endDelay = 100
  }
  if (mutation === 'iterations') {
    animation.iterations = 2
  }
  if (mutation === 'iteration-start') {
    animation.iterationStart = 0.5
  }
  if (mutation === 'direction') {
    animation.direction = 'reverse'
  }
  if (mutation === 'easing') {
    animation.easing = 'ease-in'
  }
  if (mutation === 'keyframe-easing') {
    animation.keyframes[0]!.easing = 'ease-in'
  }
  if (mutation === 'playback-rate') {
    animation.playbackRate = 2
  }
  if (mutation === 'reversed-clock') {
    animation.timelineTime = 1
  }
  if (mutation === 'pending-again') {
    animation.pending = true
    animation.startTime = null
  }
  expect(naturalStartingTimeline(frames, 1, true)).toBe(false)
})

it('只允许起始 pending 帧，完整自然运行仍必须存在', () => {
  const frames = timeline()
  const pending = structuredClone(frames[0]!)
  Object.assign(pending, { time: 39, probe: 0 })
  Object.assign(pending.animation, { pending: true, currentTime: 0, startTime: null, timelineTime: 39 })
  expect(naturalStartingTimeline([pending, ...frames], 1, true)).toBe(true)
  expect(naturalStartingTimeline([pending, pending, pending], 1, false)).toBe(false)
})

it('重插必须创建不同原生 transition，不能复用上一轮身份', () => {
  const first = timeline(0)
  const second = timeline(0).map(frame => ({ ...frame, cycle: 2 }))
  expect(naturalStartingTimeline([...first, ...second], 2, true)).toBe(false)
  second.forEach(frame => frame.animation.identity = 2)
  expect(naturalStartingTimeline([...first, ...second], 2, true)).toBe(true)
})

it('时钟各自量化不放大既有 opacity 容差，进度漂移仍失败', () => {
  const frames = timeline()
  frames[1]!.animation.timelineTime += 0.02
  expect(naturalStartingTimeline(frames, 1, true)).toBe(true)
  frames[1]!.animation.timelineTime += 7
  expect(naturalStartingTimeline(frames, 1, true)).toBe(false)
})

it.each(['currentTime', 'timelineTime', 'pending', 'documentTimeline', 'targetMatches'] as const)('原生 %s 缺失不能以零或旧判定替代', (field) => {
  const frames = timeline(0)
  Reflect.set(frames[1]!.animation, field, field.endsWith('Time') ? null : undefined)
  expect(naturalStartingTimeline(frames, 1, true)).toBe(false)
})
