export interface AndroidCaptureSwipe {
  atMilliseconds: number
  fromY: number
  toY: number
  durationMilliseconds: number
}

/** Android screenrecord 不持续编码静止帧，末尾必须留下真实原生滚动。 */
export function androidCaptureScrollSchedule(durationSeconds: number): AndroidCaptureSwipe[] {
  if (!Number.isInteger(durationSeconds) || durationSeconds < 5 || durationSeconds > 180) {
    throw new Error('Android 录制时长必须为 5 到 180 秒。')
  }
  return [
    { atMilliseconds: 2600, fromY: 1480, toY: 720, durationMilliseconds: 700 },
    { atMilliseconds: durationSeconds * 1000 - 1000, fromY: 760, toY: 1320, durationMilliseconds: 700 },
  ]
}

export async function performAndroidCaptureScroll(
  durationSeconds: number,
  swipe: (gesture: AndroidCaptureSwipe) => Promise<void>,
  now = () => performance.now(),
  wait = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds)),
) {
  const started = now()
  for (const gesture of androidCaptureScrollSchedule(durationSeconds)) {
    // 以录制起点调度，ADB 操作自身耗时不应累积到末尾手势。
    await wait(Math.max(0, started + gesture.atMilliseconds - now()))
    await swipe(gesture)
  }
}
