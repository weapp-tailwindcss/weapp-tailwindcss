import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCase } from '../scripts/run-matrix.mjs'
import { stopChild } from '../scripts/watch-process.mjs'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), sampler: vi.fn(), diagnostics: vi.fn() }))
vi.mock('node:child_process', async original => ({ ...await original(), spawn: mocks.spawn }))
vi.mock('../scripts/process-memory.mjs', async original => ({ ...await original(), createProcessMemorySampler: mocks.sampler }))
vi.mock('../scripts/diagnostics/controller.mjs', () => ({ createCaseDiagnostics: mocks.diagnostics }))
const roots = []
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

describe('watch 回滚的生产者生命周期', () => {
  const cases = [
    ...['watch', 'dev-server'].flatMap(driver => [0, 1, 'SIGTERM'].flatMap(exit => [false, true].map(outputRestored => ({ driver, exit, outputRestored })))),
    ...['watch', 'dev-server'].map(driver => ({ driver, exit: 1, outputRestored: true, exitAtProbe: true })),
    { driver: 'watch', exit: 1, outputRestored: true, exitAtStop: true },
  ]
  it.each(cases)('$driver 回滚时退出 $exit，产物已恢复=$outputRestored，仍保留退出与日志', async ({ driver, exit, outputRestored, exitAtProbe, exitAtStop }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-watch-exit-'))
    roots.push(root)
    const source = path.join(root, 'input.vue')
    const output = path.join(root, 'output.wxml')
    const original = '<template><view class="flex">fixture</view></template>'
    const writeFile = fs.writeFile.bind(fs)
    await writeFile(source, original)
    await writeFile(output, original)
    let served = original
    let mutated = false
    let rollback = false
    const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() })
    const exitProducer = () => {
      child.stderr.emit('data', Buffer.from('fixture mapped evidence cap exceeded\n'))
      child.exitCode = typeof exit === 'number' ? exit : null
      child.signalCode = typeof exit === 'string' ? exit : null
      child.emit('close', child.exitCode, child.signalCode)
    }
    mocks.spawn.mockReset().mockImplementation(() => {
      queueMicrotask(() => child.stdout.emit('data', Buffer.from('fixture-ready\n')))
      return child
    })
    mocks.sampler.mockReset().mockReturnValue({ stop: () => ({ count: 0 }) })
    mocks.diagnostics.mockReset().mockResolvedValue(exitAtStop
      ? {
          env: {},
          spawned() {},
          mark() {},
          async finish() {},
          async beforeStop() {
            await Promise.resolve()
            exitProducer()
          },
        }
      : undefined)
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (rollback && exitAtProbe) {
        exitProducer()
      }
      return { ok: true, text: async () => served }
    }))
    const readFile = fs.readFile.bind(fs)
    vi.spyOn(fs, 'readFile').mockImplementation(async (file, ...args) => {
      const text = await readFile(file, ...args)
      if (file === output && rollback && exitAtProbe) {
        exitProducer()
      }
      return text
    })
    vi.spyOn(fs, 'writeFile').mockImplementation(async (file, text, ...args) => {
      await writeFile(file, text, ...args)
      if (file !== source) {
        return
      }
      if (text !== original) {
        mutated = true
        served = text
        await writeFile(output, text)
        child.stdout.emit('data', Buffer.from('[weapp-tailwindcss:hmr] {"bundler":"webpack","phase":"processAssets","durationMs":23}\n'))
      }
      else if (mutated) {
        rollback = true
        if (outputRestored) {
          served = original
          await writeFile(output, original)
        }
        if (!exitAtProbe && !exitAtStop) {
          exitProducer()
        }
      }
    })
    const project = { key: 'fixture', project: '.', devScript: 'dev', sourceFile: 'input.vue', outputTemplate: 'output.wxml', injectType: 'vue', watchReadyLog: 'fixture-ready', hmrDriver: driver }
    const failure = await runCase({ root, version: 'fixture' }, project, { buildRuns: 0, hmrRuns: 1, timeoutMs: 100, pollIntervalMs: 1 }).catch(error => error)
    expect(failure).toBeInstanceOf(Error)
    expect(failure.message).toContain(exitAtStop ? 'exited during hmr shutdown' : 'exited during hmr rollback round=1')
    expect(failure.message).toContain(typeof exit === 'number' ? `code=${exit}` : `signal=${exit}`)
    expect(failure.message).toContain('fixture mapped evidence cap exceeded')
    expect(failure.message).not.toContain('timeout')
    expect(await fs.readFile(source, 'utf8')).toBe(original)
  })
})

describe('watch 的受控收尾', () => {
  it.each(['sync', 'async', 'term'])('%s close 后不会继续发送升级信号', async (mode) => {
    vi.useFakeTimers()
    const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null })
    child.kill = vi.fn((signal) => {
      const close = () => {
        child.signalCode = signal
        child.emit('close', null, signal)
      }
      if (mode === 'sync' || (mode === 'term' && signal === 'SIGTERM')) {
        close()
      }
      if (mode === 'async') {
        queueMicrotask(close)
      }
      return true
    })
    const stopped = stopChild(child)
    await vi.runAllTimersAsync()
    await stopped
    expect(child.kill.mock.calls.map(([signal]) => signal)).toEqual(mode === 'term' ? ['SIGINT', 'SIGTERM'] : ['SIGINT'])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('未关闭时保留原升级信号及 1200/4000ms 上限', async () => {
    vi.useFakeTimers()
    const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, kill: vi.fn() })
    const stopped = stopChild(child)
    expect(child.kill.mock.calls).toEqual([['SIGINT']])
    await vi.advanceTimersByTimeAsync(1199)
    expect(child.kill).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(child.kill.mock.calls[1]).toEqual(['SIGTERM'])
    await vi.advanceTimersByTimeAsync(2799)
    expect(child.kill).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await stopped
    expect(child.kill.mock.calls[2]).toEqual(['SIGKILL'])
    expect(vi.getTimerCount()).toBe(0)
  })
})
