import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { execa } from 'execa'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { recordAndroidVideo, waitForAndroidRecordingReady } from './lynx/android-recording'
import { createEvidenceContext } from './lynx/evidence'
import { command } from './lynx/native-command'

vi.mock('execa', () => ({ execa: vi.fn() }))
vi.mock('./lynx/native-command', () => ({ command: vi.fn() }))
const directories: string[] = []
beforeEach(() => vi.resetAllMocks())
afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

it('waits through actual encoder initialization before accepting a split content-area marker', async () => {
  vi.useFakeTimers()
  const output = new PassThrough()
  const complete = new Promise(() => {})
  const ready = vi.fn()
  const waiting = waitForAndroidRecordingReady(output, complete).then(ready)
  output.write('Time limit set to 18 seconds\nDisplay is 1080x2424\nConfiguring recorder for 1080x2424 video/avc at 6Mbps\n')
  await vi.advanceTimersByTimeAsync(8000)
  expect(ready).not.toHaveBeenCalled()
  output.write('Content ar')
  output.write('ea is 1080x2424 at offset x=0 y=0')
  await vi.advanceTimersByTimeAsync(0)
  expect(ready).not.toHaveBeenCalled()
  output.write('\n')
  await waiting
  expect(ready).toHaveBeenCalledExactlyOnceWith('Content area is 1080x2424 at offset x=0 y=0')
  expect(output.listenerCount('data')).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('accepts a rotated content-area marker with CRLF without waiting for process exit', async () => {
  const output = new PassThrough()
  const waiting = waitForAndroidRecordingReady(output, new Promise(() => {}))
  output.write('Rotated content area is 2424x1080 at offset x=0 y=0\r\n')
  await expect(waiting).resolves.toBe('Rotated content area is 2424x1080 at offset x=0 y=0')
})

it('fails bounded readiness when the encoder never initializes and removes listeners', async () => {
  vi.useFakeTimers()
  const output = new PassThrough()
  const waiting = waitForAndroidRecordingReady(output, new Promise(() => {}), 45_000)
  const failure = expect(waiting).rejects.toThrow('录制就绪超时')
  output.write('Configuring recorder for 1080x2424\n')
  await vi.advanceTimersByTimeAsync(45_000)
  await failure
  expect(output.listenerCount('data')).toBe(0)
})

it('rejects a successful or failed early exit without inventing readiness', async () => {
  const output = new PassThrough()
  await expect(waitForAndroidRecordingReady(output, Promise.resolve({ exitCode: 0 }))).rejects.toThrow('就绪前退出')
  await expect(waitForAndroidRecordingReady(output, Promise.reject(new Error('codec failed')))).rejects.toThrow('就绪前失败')
  await expect(waitForAndroidRecordingReady(null, Promise.resolve({}))).rejects.toThrow('缺少标准输出流')
  expect(output.listenerCount('data')).toBe(0)
})

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-android-recording-'))
  directories.push(directory)
  let finish!: (result: { exitCode: number, timedOut: boolean, signal?: string }) => void
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const recording = Object.assign(new Promise(resolve => finish = resolve), {
    stdout,
    stderr,
    kill: vi.fn(() => {
      finish({ exitCode: 130, timedOut: false, signal: 'SIGINT' })
      return true
    }),
  })
  vi.mocked(execa).mockImplementation((_file, args) => {
    return (Array.isArray(args) && args.includes('screenrecord') ? recording : Promise.resolve({ exitCode: 0 })) as never
  })
  vi.mocked(command).mockResolvedValue('')
  const context = createEvidenceContext(Buffer.from('本轮实际录制 bundle'))
  return { directory, recording, finish, stdout, stderr, context }
}

it('starts real swipe scheduling after delayed encoder readiness and saves bound provenance', async () => {
  const state = await fixture()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
  const running = recordAndroidVideo(state.directory, state.directory, { platform: 'android', id: 'fixture' }, 18, state.context)
  await vi.advanceTimersByTimeAsync(0)
  state.stdout.write('Configuring recorder for 1080x2424\n')
  state.stderr.write('codec diagnostic\n')
  await vi.advanceTimersByTimeAsync(8000)
  expect(command).not.toHaveBeenCalled()
  state.stdout.write('Content area is 1080x2424 at offset x=0 y=0\n')
  await vi.advanceTimersByTimeAsync(2600)
  expect(command).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(14_400)
  expect(command).toHaveBeenCalledTimes(2)
  state.finish({ exitCode: 0, timedOut: false })
  await running
  const summary = JSON.parse(await fs.readFile(path.join(state.directory, 'capture-scroll.json'), 'utf8'))
  expect(summary).toMatchObject({ ...state.context, platform: 'android', durationSeconds: 18, outcome: 'success' })
  expect(summary.events.find((event: { action: string }) => event.action === 'ready').sinceLaunchMilliseconds).toBe(8000)
  expect(summary.events.filter((event: { action: string }) => event.action === 'swipe-start').map((event: { sinceReadyMilliseconds: number }) => event.sinceReadyMilliseconds)).toEqual([2600, 17_000])
  expect(await fs.readFile(path.join(state.directory, 'screenrecord.stdout.log'), 'utf8')).toContain('Content area is')
  expect(await fs.readFile(path.join(state.directory, 'screenrecord.stderr.log'), 'utf8')).toBe('codec diagnostic\n')
})

it('preserves logs and source identity when screenrecord exits before becoming ready', async () => {
  const state = await fixture()
  const running = recordAndroidVideo(state.directory, state.directory, { platform: 'android', id: 'fixture' }, 18, state.context)
  const failure = expect(running).rejects.toThrow('录制就绪前退出')
  await Promise.resolve()
  state.stdout.write('Configuring recorder for 1080x2424\n')
  state.finish({ exitCode: 0, timedOut: false })
  await failure
  const summary = JSON.parse(await fs.readFile(path.join(state.directory, 'capture-scroll.json'), 'utf8'))
  expect(summary).toMatchObject({ ...state.context, outcome: 'failure' })
  expect(summary.events.some((event: { action: string }) => event.action === 'swipe-start')).toBe(false)
  expect(await fs.readFile(path.join(state.directory, 'screenrecord.stdout.log'), 'utf8')).toContain('Configuring recorder')
})

it('fails if recording ends before a scheduled native gesture instead of swiping outside the video', async () => {
  const state = await fixture()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
  const running = recordAndroidVideo(state.directory, state.directory, { platform: 'android', id: 'fixture' }, 18, state.context)
  const failure = expect(running).rejects.toThrow('末次原生滑动前退出')
  await vi.advanceTimersByTimeAsync(0)
  state.stdout.write('Content area is 1080x2424 at offset x=0 y=0\n')
  await vi.advanceTimersByTimeAsync(0)
  state.finish({ exitCode: 0, timedOut: false })
  await vi.advanceTimersByTimeAsync(2600)
  await failure
  expect(command).not.toHaveBeenCalled()
  const summary = JSON.parse(await fs.readFile(path.join(state.directory, 'capture-scroll.json'), 'utf8'))
  expect(summary.outcome).toBe('failure')
})
