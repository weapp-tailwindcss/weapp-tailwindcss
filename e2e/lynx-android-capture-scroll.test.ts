import { expect, it } from 'vitest'
import { androidCaptureScrollSchedule, performAndroidCaptureScroll } from './lynx/android-capture-scroll'

it('records real native motion near the end of a fifteen-second capture', () => {
  const [down, back] = androidCaptureScrollSchedule(15)
  expect(down).toEqual({ atMilliseconds: 2600, fromY: 1480, toY: 720, durationMilliseconds: 700 })
  expect(back).toEqual({ atMilliseconds: 14000, fromY: 760, toY: 1320, durationMilliseconds: 700 })
  expect(back!.atMilliseconds + back!.durationMilliseconds).toBeGreaterThan(14_500)
  expect(back!.atMilliseconds + back!.durationMilliseconds).toBeLessThan(15_000)
})

it.each([5, 8, 15, 60, 180])('keeps ordered complete native gestures inside a %s-second capture', (duration) => {
  const [down, back] = androidCaptureScrollSchedule(duration)
  expect(down!.atMilliseconds + down!.durationMilliseconds).toBeLessThan(back!.atMilliseconds)
  expect(back!.atMilliseconds + back!.durationMilliseconds).toBe(duration * 1000 - 300)
})

it.each([0, 4, 181, 15.5, Number.NaN])('rejects an invalid capture duration %s', (duration) => {
  expect(() => androidCaptureScrollSchedule(duration)).toThrow('5 到 180 秒')
})

it('absorbs early ADB latency instead of shifting the last swipe past recording stop', async () => {
  let clock = 100
  const starts: number[] = []
  await performAndroidCaptureScroll(15, async (gesture) => {
    starts.push(clock - 100)
    clock += gesture.durationMilliseconds + 350
  }, () => clock, async (milliseconds) => {
    clock += milliseconds
  })
  expect(starts).toEqual([2600, 14000])
})

it('propagates a native gesture failure instead of accepting an unchanged recording', async () => {
  await expect(performAndroidCaptureScroll(15, async () => {
    throw new Error('adb swipe failed')
  }, () => 0, async () => {})).rejects.toThrow('adb swipe failed')
})
