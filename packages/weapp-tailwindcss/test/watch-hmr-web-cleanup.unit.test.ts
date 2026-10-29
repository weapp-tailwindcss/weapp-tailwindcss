import type { CliOptions, WatchCase } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runWebHmr } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/web'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), browser: vi.fn(), sampler: vi.fn(), source: vi.fn(), mutate: vi.fn(), controller: vi.fn() }))

vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/process-controller', () => ({
  createWatchProcessController: () => mocks.controller(),
  WEB_STOP_PHASES: [],
}))
vi.mock('playwright', () => ({ chromium: { launch: () => mocks.browser() } }))
vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session', async importOriginal => ({
  ...await importOriginal<typeof import('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session')>(),
  spawnPnpm: (...args: unknown[]) => mocks.spawn(...args),
}))
vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/process-identity', () => ({ prepareWatchIdentitySource: async () => undefined }))
vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/source')>()
  return { ...actual, spawnWithWatchMemorySource: (cwd: string, spawnChild: () => unknown) => actual.spawnWithWatchMemorySource(cwd, spawnChild, () => mocks.source()) }
})
vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/sampler', () => ({
  createMemorySampler: () => mocks.sampler(),
}))
vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text', async importOriginal => ({
  ...await importOriginal<typeof import('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text')>(),
  writeWatchedFilePreserveEol: (...args: unknown[]) => mocks.mutate(...args),
}))

function errorTree(error: unknown): unknown[] {
  if (!(error instanceof Error)) {
    return [error]
  }
  return [error, ...('errors' in error && Array.isArray(error.errors) ? error.errors.flatMap(errorTree) : []), ...('cause' in error ? errorTree(error.cause) : [])]
}

describe('Web watch source and owned resource cleanup', () => {
  let directory: string
  beforeEach(async () => {
    vi.resetAllMocks()
    mocks.controller.mockReturnValue({ capture: vi.fn(async () => new Map()), stop: vi.fn(async () => {}) })
    mocks.source.mockResolvedValue({ sample: vi.fn(), close: vi.fn(async () => {}) })
    directory = await mkdtemp(path.join(os.tmpdir(), 'web-watch-cleanup-'))
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  it.each(['restore', 'browser', 'stop', 'all'])('preserves the HMR error and continues every cleanup after %s failure', async (failure) => {
    const source = path.join(directory, 'index.tsx')
    const css = path.join(directory, 'styles.css')
    const original = 'original\r\nsecond\n'
    await Promise.all([source, css].map(file => writeFile(file, original)))
    const primary = new Error('original HMR failure')
    const restoreError = new Error('source restore denied')
    const browserError = new Error('browser close failed')
    const stopError = new Error('memory probe close not confirmed')
    const processError = new Error('watch descendants remain alive')
    const controller = mocks.controller()
    if (failure === 'all') {
      controller.stop.mockRejectedValue(processError)
    }
    const browser = { newPage: vi.fn(async () => ({ goto: vi.fn(), locator: () => ({ waitFor: vi.fn() }) })), close: vi.fn(async () => {}) }
    const sampler = { stop: vi.fn(async () => {}) }
    if (failure === 'browser' || failure === 'all') {
      browser.close.mockRejectedValue(browserError)
    }
    if (failure === 'stop' || failure === 'all') {
      sampler.stop.mockRejectedValue(stopError)
    }
    mocks.browser.mockResolvedValue(browser)
    mocks.sampler.mockReturnValue(sampler)
    const child = Object.assign(new EventEmitter(), { exitCode: null as number | null, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
    child.kill.mockImplementation(() => {
      child.exitCode = 0
      return true
    })
    mocks.spawn.mockImplementation(() => {
      setTimeout(() => child.stdout.emit('data', Buffer.from('ready in 1ms\n')), 5)
      return child
    })
    let changed = false
    const actualRead = fs.readFile
    vi.spyOn(fs, 'readFile').mockImplementation((...args) => {
      if (changed && args[0] === source && (failure === 'restore' || failure === 'all')) {
        return Promise.reject(restoreError)
      }
      return actualRead(...args)
    })
    mocks.mutate.mockImplementation(async () => {
      await Promise.all([source, css].map(file => writeFile(file, 'changed\n')))
      changed = true
      throw primary
    })
    const watchCase = {
      name: 'taro-vite-react-tailwindcss-v4',
      label: 'web cleanup',
      cwd: directory,
      webHmr: { sourceFile: source, cssEntryFile: css, devScript: 'dev', mutate: (value: string) => `${value}\nchanged` },
    } as WatchCase
    const error = await runWebHmr(watchCase, { timeoutMs: 1000, pollMs: 1 } as CliOptions, new Map([[source, original], [css, original]])).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(errorTree(error)).toContain(primary)
    expect(error.message).toContain('original HMR failure')
    expect(browser.close).toHaveBeenCalledOnce()
    expect(sampler.stop).toHaveBeenCalledOnce()
    expect(controller.stop).toHaveBeenCalledOnce()
    if (failure === 'all') {
      expect(errorTree(error)).toContain(processError)
    }
    expect(await readFile(css)).toEqual(Buffer.from(original))
    if (failure === 'restore' || failure === 'all') {
      expect(errorTree(error)).toContain(restoreError)
    }
    else {
      expect(await readFile(source)).toEqual(Buffer.from(original))
    }
    if (failure === 'browser' || failure === 'all') {
      expect(errorTree(error)).toContain(browserError)
    }
    if (failure === 'stop' || failure === 'all') {
      expect(errorTree(error)).toContain(stopError)
    }
  })

  it.each([false, true])('closes only the prepared source when Web spawn fails, close failure=%s', async (closeFails) => {
    const sourceFile = path.join(directory, 'index.tsx')
    const primary = new Error('Web spawn failed')
    const closeError = new Error('source close failed')
    const source = { sample: vi.fn(), close: vi.fn(async () => {
      if (closeFails) {
        throw closeError
      }
    }) }
    mocks.source.mockResolvedValue(source)
    mocks.spawn.mockImplementation(() => {
      throw primary
    })
    const watchCase = { name: 'taro-vite-react-tailwindcss-v4', label: 'web spawn', cwd: directory, webHmr: { sourceFile, devScript: 'dev', mutate: (value: string) => `${value} changed` } } as WatchCase
    const error = await runWebHmr(watchCase, {} as CliOptions, new Map([[sourceFile, 'original']])).catch(error => error)
    expect(source.close).toHaveBeenCalledOnce()
    expect(mocks.browser).not.toHaveBeenCalled()
    expect(mocks.sampler).not.toHaveBeenCalled()
    if (closeFails) {
      expect(error.errors).toEqual([primary, closeError])
    }
    else { expect(error).toBe(primary) }
  })
  it('preserves initialization failure while closing the watcher and memory source', async () => {
    const sourceFile = path.join(directory, 'index.tsx')
    await writeFile(sourceFile, 'original')
    const primary = new Error('initial identity capture failed')
    const processError = new Error('watch cleanup failed')
    const memoryError = new Error('memory cleanup failed')
    const child = Object.assign(new EventEmitter(), {
      pid: 42,
      exitCode: null,
      signalCode: null,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    })
    const controller = mocks.controller()
    controller.capture.mockRejectedValue(primary)
    controller.stop.mockRejectedValue(processError)
    const sampler = { stop: vi.fn(async () => {
      throw memoryError
    }) }
    mocks.sampler.mockReturnValue(sampler)
    mocks.spawn.mockReturnValue(child)
    const watchCase = {
      name: 'taro-vite-react-tailwindcss-v4',
      label: 'web initialization',
      cwd: directory,
      webHmr: { sourceFile, devScript: 'dev', mutate: (value: string) => `${value} changed` },
    } as WatchCase
    const error = await runWebHmr(watchCase, {} as CliOptions, new Map([[sourceFile, 'original']])).catch(error => error)
    for (const failure of [primary, processError, memoryError]) {
      expect(errorTree(error)).toContain(failure)
    }
    expect(controller.stop).toHaveBeenCalledOnce()
    expect(sampler.stop).toHaveBeenCalledOnce()
    expect(mocks.browser).not.toHaveBeenCalled()
    expect(await readFile(sourceFile, 'utf8')).toBe('original')
    expect(child.stdout.destroyed).toBe(true)
  })
})
