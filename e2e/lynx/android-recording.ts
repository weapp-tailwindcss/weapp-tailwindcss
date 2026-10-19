import type { NativeEvidenceContext } from '../../examples/react-lynx/src/compatibility/types'
import type { AndroidDevice } from './native-device'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execa } from 'execa'
import { performAndroidCaptureScroll } from './android-capture-scroll'
import { command } from './native-command'
import { adbArgs } from './native-device'

/** 编码器完成初始化后才输出该标记；不能把本地 adb 进程创建当成录制就绪。 */
export function waitForAndroidRecordingReady(output: NodeJS.ReadableStream | null, completion: PromiseLike<unknown>, timeoutMilliseconds = 45_000) {
  return new Promise<string>((resolve, reject) => {
    if (!output) {
      reject(new Error('Android screenrecord 缺少标准输出流，无法确认录制就绪。'))
      return
    }
    let buffered = ''
    let settled = false
    const finish = (error?: Error, marker?: string) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      output.removeListener('data', onData)
      if (error) {
        reject(error)
      }
      else {
        resolve(marker!)
      }
    }
    const onData = (chunk: unknown) => {
      buffered = `${buffered}${String(chunk)}`.slice(-16_384)
      const match = /(?:^|[\r\n])((?:Content area|Rotated content area) is [^\r\n]+)\r?\n/.exec(buffered)
      if (match) {
        finish(undefined, match[1])
      }
    }
    const timer = setTimeout(() => finish(new Error('Android screenrecord 录制就绪超时。')), timeoutMilliseconds)
    output.on('data', onData)
    completion.then(
      () => finish(new Error('Android screenrecord 在录制就绪前退出。')),
      error => finish(new Error('Android screenrecord 在录制就绪前失败。', { cause: error })),
    )
  })
}

export async function recordAndroidVideo(hostDir: string, artifactDir: string, device: AndroidDevice, durationSeconds: number, context: NativeEvidenceContext) {
  const devicePath = '/sdcard/lynx-promo-capture.mp4'
  await execa('adb', adbArgs(device, ['shell', 'rm', '-f', devicePath]), { reject: false })
  const startedAt = new Date().toISOString()
  const started = performance.now()
  const stdout: string[] = []
  const stderr: string[] = []
  const events: Array<Record<string, unknown>> = []
  let ready: number | undefined
  let failure: { error: unknown } | undefined
  const event = (action: string, details: Record<string, unknown> = {}) => events.push({
    action,
    at: new Date().toISOString(),
    sinceLaunchMilliseconds: performance.now() - started,
    ...(ready === undefined ? {} : { sinceReadyMilliseconds: performance.now() - ready }),
    ...details,
  })
  event('launch', { devicePath, durationSeconds })
  const recording = execa('adb', adbArgs(device, ['shell', 'screenrecord', '--verbose', '--time-limit', String(durationSeconds), '--bit-rate', '6000000', devicePath]), {
    reject: false,
    timeout: (durationSeconds + 60) * 1000,
    killSignal: 'SIGINT',
    forceKillAfterDelay: 5000,
  })
  recording.stdout?.on('data', chunk => stdout.push(String(chunk)))
  recording.stderr?.on('data', chunk => stderr.push(String(chunk)))
  let finished = false
  const completion = recording.then(
    (result) => {
      finished = true
      return result
    },
    (error) => {
      finished = true
      throw error
    },
  )
  try {
    const marker = await waitForAndroidRecordingReady(recording.stdout, completion)
    ready = performance.now()
    event('ready', { marker })
    let gestureIndex = 0
    await performAndroidCaptureScroll(durationSeconds, async (gesture) => {
      if (finished) {
        throw new Error('Android screenrecord 在末次原生滑动前退出。')
      }
      const index = gestureIndex++
      event('swipe-start', { index, ...gesture })
      await command('adb', adbArgs(device, ['shell', 'input', 'swipe', '540', String(gesture.fromY), '540', String(gesture.toY), String(gesture.durationMilliseconds)]), hostDir, 30_000, {
        file: path.join(artifactDir, `android-scroll-${index}-command.json`),
      })
      event('swipe-finished', { index })
    })
    const result = await completion
    event('recording-finished', { exitCode: result.exitCode, signal: result.signal, timedOut: result.timedOut })
    if (result.exitCode !== 0 || result.timedOut) {
      throw new Error(`Android screenrecord 失败：${result.shortMessage ?? result.stderr}`)
    }
    await command('adb', adbArgs(device, ['pull', devicePath, path.join(artifactDir, 'raw.mp4')]), hostDir, 120_000)
    await execa('adb', adbArgs(device, ['shell', 'rm', '-f', devicePath]), { reject: false })
  }
  catch (error) {
    failure = { error }
    event('failed', { message: error instanceof Error ? error.message : String(error) })
    if (!finished) {
      recording.kill('SIGINT')
    }
    await completion.catch(() => undefined)
    // 失败原片仍尽量取回，不覆盖上游的录制失败原因。
    await execa('adb', adbArgs(device, ['pull', devicePath, path.join(artifactDir, 'raw.mp4')]), { reject: false, timeout: 30_000 }).catch(() => undefined)
  }
  const summary = { ...context, platform: 'android', durationSeconds, startedAt, finishedAt: new Date().toISOString(), outcome: failure ? 'failure' : 'success', events }
  const writes = await Promise.allSettled([
    fs.writeFile(path.join(artifactDir, 'screenrecord.stdout.log'), stdout.join('')),
    fs.writeFile(path.join(artifactDir, 'screenrecord.stderr.log'), stderr.join('')),
    fs.writeFile(path.join(artifactDir, 'capture-scroll.json'), `${JSON.stringify(summary, null, 2)}\n`),
  ])
  const failures = writes.filter(result => result.status === 'rejected').map(result => result.reason)
  if (failures.length > 0) {
    throw new AggregateError(failure ? [failure.error, ...failures] : failures, 'Android 录制诊断证据无法完整保存。')
  }
  if (failure) {
    throw failure.error
  }
}
