import type { StartingAnimation, StartingFrame } from './types'

export const startingOpacityTolerance = 0.005

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function nativeTiming(animation: StartingAnimation | undefined): animation is StartingAnimation {
  return Boolean(animation
    && Number.isInteger(animation.identity) && animation.identity > 0
    && animation.native === true && animation.targetMatches === true && animation.documentTimeline === true
    && typeof animation.pending === 'boolean' && typeof animation.registered === 'boolean'
    && animation.target === 'probe' && animation.property === 'opacity'
    && animation.duration === 1200 && animation.playbackRate === 1
    && animation.delay === 0 && animation.endDelay === 0
    && animation.iterations === 1 && animation.iterationStart === 0
    && animation.direction === 'normal' && animation.easing === 'linear'
    && animation.matches === (animation.registered ? 1 : 0)
    && Array.isArray(animation.keyframes) && animation.keyframes.length === 2
    && animation.keyframes.every((frame, index) => frame.computedOffset === index && frame.opacity === String(index) && frame.easing === 'linear'))
}

/** 用同帧原生时钟核对固定 0→1 / 1200ms oracle，首次 rAF 不承担调度时限。 */
export function naturalStartingTimeline(frames: readonly StartingFrame[], cycle: number, completed: boolean) {
  const raw = frames.filter(frame => frame.cycle === cycle)
  // 同步插入时 Firefox 尚未提交 starting 样式；记录保留，但不能冒充渲染帧。
  if (raw.some((frame, index) => frame.phase === 'insertion' && (index !== 0 || !finite(frame.time) || frame.control !== 1))) {
    return false
  }
  const selected = raw.filter(frame => frame.phase !== 'insertion')
  const identity = selected[0]?.animation?.identity
  if (selected.length < 3 || !identity || frames.some(frame => frame.cycle !== cycle && frame.animation?.identity === identity)) {
    return false
  }
  let startTime: number | undefined
  let lastTimeline: number | undefined
  const valid = selected.every((frame, index) => {
    const animation = frame.animation
    const previous = selected[index - 1]
    if (!finite(frame.time) || !finite(frame.probe) || frame.control !== 1 || frame.probe < 0 || frame.probe > 1
      || (previous && (frame.time < previous.time || frame.probe < previous.probe))
      || !nativeTiming(animation) || animation.identity !== identity || !finite(animation.timelineTime)
      || (lastTimeline !== undefined && animation.timelineTime < lastTimeline)) {
      return false
    }
    lastTimeline = animation.timelineTime
    // 只允许运行前的原生 pending；缺失时钟不能转换为零或回退旧判定。
    if (animation.pending) {
      return startTime === undefined && animation.startTime === null && (animation.currentTime === null || animation.currentTime === 0)
        && frame.probe === 0 && animation.playState === 'running' && animation.registered
    }
    if (!finite(animation.startTime) || !finite(animation.currentTime) || animation.currentTime < 0 || animation.currentTime > 1200) {
      return false
    }
    startTime ??= animation.startTime
    const expectedTime = Math.min(1200, Math.max(0, animation.timelineTime - startTime))
    // Firefox 的三个高精度时钟各自舍入；两条独立进度均使用既有 opacity 误差限。
    return animation.startTime === startTime && Math.abs(animation.currentTime / 1200 - expectedTime / 1200) <= startingOpacityTolerance
      && Math.abs(frame.probe - animation.currentTime / 1200) <= startingOpacityTolerance
      && Math.abs(frame.probe - expectedTime / 1200) <= startingOpacityTolerance
      && (animation.currentTime === 1200 ? animation.playState === 'finished' : animation.playState === 'running' && animation.registered)
  })
  return valid && startTime !== undefined
    && selected.at(-1)!.time > selected[0]!.time
    && selected.some(frame => frame.probe > 0.05 && frame.probe < 0.95)
    && selected.filter((frame, index) => index > 0 && frame.probe > selected[index - 1]!.probe).length >= 2
    && (!completed || (selected.at(-1)!.probe === 1 && selected.at(-1)!.animation!.currentTime === 1200))
}
