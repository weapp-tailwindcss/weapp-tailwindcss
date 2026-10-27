import type { Options, ResultPromise } from 'execa'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { afterEach, expect, it, vi } from 'vitest'
import * as host from './native-command/host'
import { createNativeCaptureBudget, NATIVE_CAPTURE_TIMEOUT } from './react-native/capture-budget'
import { createIosScreenshotDiagnostics } from './react-native/ios-screenshot'

vi.mock('execa', () => ({ execa: vi.fn() }))
const directories: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const directory of directories.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ios-host-resources-'))
  directories.push(directory)
  const output = path.join(directory, 'frame.png')
  await fs.writeFile(output, new Uint8Array(2048))
  const events = Object.assign(new EventEmitter(), { pid: 42 })
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const completion = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  const command = Object.assign(events, { then: completion.then.bind(completion) }) as unknown as ResultPromise
  vi.mocked(execa).mockReset().mockReturnValue(command)
  const diagnostics = createIosScreenshotDiagnostics(directory, 'resources-run', { platform: 'linux' })
  const read = async () => JSON.parse(await fs.readFile(path.join(directory, 'ios-screenshots.json'), 'utf8'))
  return { output, command, diagnostics, read, resolve, reject }
}

it.each(['succeeded', 'failed'] as const)('资源读取异常不改变截图的 %s 结果，也不启动额外命令', async (status) => {
  const context = await fixture()
  const resources = vi.spyOn(host, 'captureNativeHostResources').mockImplementation(() => {
    throw new Error('resources unavailable')
  })
  const primary = new Error('owned screenshot failed')
  const captured = context.diagnostics.capture(context.output, 'bound-device')
  const asserted = status === 'succeeded' ? expect(captured).resolves.toBe(context.output) : expect(captured).rejects.toBe(primary)
  if (status === 'succeeded') {
    context.resolve()
  }
  else {
    context.reject(primary)
  }
  await asserted
  await context.diagnostics.flush()
  expect(resources).toHaveBeenCalledTimes(2)
  expect(execa).toHaveBeenCalledTimes(1)
  expect((await context.read()).records[0]).toMatchObject({
    status,
    hostResources: { source: 'test-runner', started: { error: 'Error: resources unavailable' }, settled: { error: 'Error: resources unavailable' } },
  })
})

it('后续截图独立读取主机资源，不沿用前一条成功命令的现场', async () => {
  const context = await fixture()
  const resources = vi.spyOn(host, 'captureNativeHostResources')
  const first = context.diagnostics.capture(context.output, 'bound-device')
  context.resolve()
  await first
  const primary = new Error('later screenshot failed to spawn')
  vi.mocked(execa).mockImplementation(() => {
    throw primary
  })
  await expect(context.diagnostics.capture(context.output, 'bound-device')).rejects.toBe(primary)
  await context.diagnostics.flush()
  expect(resources).toHaveBeenCalledTimes(4)
  expect(execa).toHaveBeenCalledTimes(2)
  const records = (await context.read()).records
  expect(records.map((record: { status: string }) => record.status)).toEqual(['succeeded', 'failed'])
  for (const [index, record] of records.entries()) {
    expect(record.hostResources.started.resources).toEqual(resources.mock.results[index * 2].value)
    expect(record.hostResources.settled.resources).toEqual(resources.mock.results[index * 2 + 1].value)
  }
})

it('非零资源读取耗时占用原预算，取消先转发到原命令再读取现场', async () => {
  const context = await fixture()
  vi.useFakeTimers()
  const original = host.captureNativeHostResources
  const order: string[] = []
  vi.spyOn(host, 'captureNativeHostResources').mockImplementation(() => {
    order.push('resources')
    vi.advanceTimersByTime(100)
    return original()
  })
  vi.mocked(execa).mockImplementation((_file: string | URL, argsOrOptions?: readonly string[] | Options, options?: Options) => {
    const commandOptions = options ?? argsOrOptions as Options | undefined
    commandOptions?.cancelSignal?.addEventListener('abort', () => {
      order.push('command-cancel')
    }, { once: true })
    return context.command
  })
  const budget = createNativeCaptureBudget(1)
  const result = budget.capture(signal => context.diagnostics.capture(context.output, 'bound-device', signal)).catch(error => error)
  await vi.advanceTimersByTimeAsync(NATIVE_CAPTURE_TIMEOUT - 100)
  expect(await result).toEqual(new Error('Native semantic host capture exceeded 10000ms'))
  expect(order).toEqual(['resources', 'command-cancel', 'resources'])
  const primary = new Error('owned command canceled')
  context.reject(primary)
  await expect(budget.drain()).rejects.toBe(primary)
  await context.diagnostics.flush()
  const record = (await context.read()).records[0]
  expect(record.hostResources).toMatchObject({ started: { atMs: 0, durationMs: 100 }, cancelled: { atMs: 10000, durationMs: 100 } })
  expect(record.error).toBe(String(primary))
  expect(budget.elapsed()).toBe(NATIVE_CAPTURE_TIMEOUT)
  expect(vi.getTimerCount()).toBe(0)
  expect(execa).toHaveBeenCalledTimes(1)
})
