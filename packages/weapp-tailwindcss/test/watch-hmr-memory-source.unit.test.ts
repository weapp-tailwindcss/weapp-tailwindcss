import type { ChildProcess, spawn } from 'node:child_process'
import type { WatchMemorySource } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/source'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { windowsObserverArgs } from '../../../scripts/demo-e2e-workflow/process-observer/script'
import { windowsObserverShutdownScript } from '../../../scripts/demo-e2e-workflow/process-observer/shutdown-script'
import { runMemoryProbe } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/probe'
import { createMemorySampler } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/sampler'
import { MemorySourceError, prepareWatchMemorySource, spawnWithWatchMemorySource } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/source'
import { windowsWatchMemoryArgs } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/windows'

interface Request { id: number, kind: string, rootPid: number, cwd: string }
const measured = { rssMb: 640, maxProcessRssMb: 512, processCount: 2 }

function provider() {
  const child = Object.assign(new EventEmitter(), { pid: 42, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
  const requests: Request[] = []
  const send = (value: unknown) => child.stdout.write(`${JSON.stringify(value)}\n`)
  const stage = (request: Request, event: string) => send({ event, id: request.id, kind: request.kind })
  const reply = (request: Request) => {
    stage(request, 'request-received')
    stage(request, 'query-completed')
    stage(request, 'response-ready')
    send({ id: request.id, rows: measured })
  }
  let respond = reply
  child.stdin.on('data', (chunk) => {
    const request = JSON.parse(chunk.toString()) as Request
    requests.push(request)
    queueMicrotask(() => respond(request))
  })
  child.stdin.on('finish', () => queueMicrotask(() => child.emit('close', 0, null)))
  child.kill.mockImplementation(() => {
    queueMicrotask(() => child.emit('close', null, 'SIGKILL'))
    return true
  })
  const createChild = vi.fn(() => {
    queueMicrotask(() => send({ event: 'observer-ready', pid: child.pid }))
    return child as unknown as ChildProcess
  })
  const prepare = () => prepareWatchMemorySource(String.raw`C:\repo\watch`, { platform: 'win32', spawn: createChild as unknown as typeof spawn })
  return { child, requests, createChild, prepare, reply, send, stage, respond: (fn: typeof reply) => {
    respond = fn
  } }
}

afterEach(() => vi.useRealTimers())

describe('persistent Watch memory source', () => {
  it('prepares the actual source once and keeps subsequent requests on the same PID', async () => {
    const fixture = provider()
    const source = await fixture.prepare()
    expect(fixture.requests).toEqual([{ id: 1, kind: 'memory', rootPid: 42, cwd: String.raw`C:\repo\watch` }])
    const samples = await Promise.all([source.sample(71, new AbortController().signal), source.sample(72, new AbortController().signal)])
    expect(samples).toEqual([expect.objectContaining(measured), expect.objectContaining(measured)])
    expect(fixture.requests.map(request => request.rootPid)).toEqual([42, 71, 72])
    expect(fixture.createChild).toHaveBeenCalledOnce()
    await source.close()
    expect(fixture.child.kill).not.toHaveBeenCalled()
  })

  it('keeps a single 15s provider warmup deadline after host readiness and excludes it from business runtime and samples', async () => {
    vi.useFakeTimers()
    const fixture = provider()
    fixture.respond(request => setTimeout(() => fixture.reply(request), 12_000))
    const spawnChild = vi.fn(() => ({ pid: 71 }))
    const pending = spawnWithWatchMemorySource('repo', spawnChild, fixture.prepare)
    await vi.advanceTimersByTimeAsync(11_999)
    expect(spawnChild).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    const session = await pending
    expect(session.startedAt).toBe(Date.now())
    const onSample = vi.fn()
    fixture.respond(fixture.reply)
    const sampler = createMemorySampler({ probe: signal => session.memorySource.sample(71, signal), close: session.memorySource.close, onSample, onUnavailable: vi.fn() })
    await vi.advanceTimersByTimeAsync(0)
    expect(onSample).toHaveBeenCalledOnce()
    expect(fixture.requests.map(request => request.rootPid)).toEqual([42, 71])
    await sampler.stop()
  })

  it('does not renew the preparation deadline on phase progress and blocks business spawn', async () => {
    vi.useFakeTimers()
    const fixture = provider()
    fixture.respond(request => setTimeout(() => fixture.stage(request, 'request-received'), 14_999))
    const spawnChild = vi.fn()
    const pending = spawnWithWatchMemorySource('repo', spawnChild, fixture.prepare)
    const assertion = expect(pending).rejects.toThrow('准备失败')
    await vi.advanceTimersByTimeAsync(15_000)
    await assertion
    expect(spawnChild).not.toHaveBeenCalled()
    expect(fixture.child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
    expect(fixture.requests).toHaveLength(1)
  })

  it('makes a 5s runtime timeout terminal even after an earlier valid sample', async () => {
    vi.useFakeTimers()
    const fixture = provider()
    const source = await fixture.prepare()
    const onSample = vi.fn()
    const onUnavailable = vi.fn()
    const sampler = createMemorySampler({ probe: signal => source.sample(71, signal), close: source.close, onSample, onUnavailable })
    await vi.advanceTimersByTimeAsync(0)
    fixture.respond(request => setTimeout(() => fixture.stage(request, 'request-received'), 4999))
    await vi.advanceTimersByTimeAsync(6000)
    expect(onSample).toHaveBeenCalledOnce()
    expect(onUnavailable).toHaveBeenCalledOnce()
    expect(onUnavailable.mock.calls[0]![0]).toBeInstanceOf(MemorySourceError)
    expect(onUnavailable.mock.calls[0]![0].message).toContain('request-received')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fixture.requests).toHaveLength(3)
    expect(fixture.createChild).toHaveBeenCalledOnce()
    const stopping = sampler.stop()
    expect(sampler.stop()).toBe(stopping)
    await expect(stopping).rejects.toBe(onUnavailable.mock.calls[0]![0])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not accept a late response before the timer callback executes', async () => {
    vi.useFakeTimers()
    const fixture = provider()
    const source = await fixture.prepare()
    fixture.respond((request) => {
      vi.setSystemTime(Date.now() + 5001)
      fixture.reply(request)
    })
    await expect(source.sample(71, new AbortController().signal)).rejects.toBeInstanceOf(MemorySourceError)
    await expect(source.close()).rejects.toBeInstanceOf(MemorySourceError)
    expect(fixture.child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  })

  it('rejects a valid response followed by corrupt data in the same block', async () => {
    const fixture = provider()
    const source = await fixture.prepare()
    fixture.respond(request => fixture.child.stdout.write(`${JSON.stringify({ id: request.id, rows: measured })}\ninvalid-json\n`))
    await expect(source.sample(71, new AbortController().signal)).rejects.toBeInstanceOf(MemorySourceError)
    await expect(source.close()).rejects.toBeInstanceOf(MemorySourceError)
  })

  it('suppresses only the exact intentional stop after confirmed source close', async () => {
    const fixture = provider()
    const source = await fixture.prepare()
    fixture.respond(() => {})
    const onUnavailable = vi.fn()
    const sampler = createMemorySampler({ probe: signal => source.sample(71, signal), close: source.close, onSample: vi.fn(), onUnavailable })
    await Promise.resolve()
    await sampler.stop()
    expect(onUnavailable).not.toHaveBeenCalled()
    expect(fixture.child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  })

  it('preserves a timeout when intentional stop races held-child close', async () => {
    vi.useFakeTimers()
    const fixture = provider()
    const source = await fixture.prepare()
    fixture.respond(() => {})
    fixture.child.kill.mockImplementation(() => true)
    const onUnavailable = vi.fn()
    const sampler = createMemorySampler({ probe: signal => source.sample(71, signal), close: source.close, onSample: vi.fn(), onUnavailable })
    await vi.advanceTimersByTimeAsync(5000)
    const stopping = sampler.stop()
    const assertion = expect(stopping).rejects.toBeInstanceOf(MemorySourceError)
    fixture.child.emit('close', null, 'SIGKILL')
    await assertion
    expect(onUnavailable).toHaveBeenCalledOnce()
    expect(onUnavailable.mock.calls[0]![0].cause.message).toContain('timeoutMs=5000')
  })

  it('fails intentional stop if the held child close cannot be confirmed', async () => {
    vi.useFakeTimers()
    const fixture = provider()
    const source = await fixture.prepare()
    fixture.respond(() => {})
    fixture.child.kill.mockImplementation(() => true)
    const sampler = createMemorySampler({ probe: signal => source.sample(71, signal), close: source.close, onSample: vi.fn(), onUnavailable: vi.fn() })
    await vi.advanceTimersByTimeAsync(0)
    const assertion = expect(sampler.stop()).rejects.toBeInstanceOf(MemorySourceError)
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
    fixture.child.emit('close', null, 'SIGKILL')
  })

  it('emits native readiness before the first JSON cmdlet and preserves Watch platform patterns', () => {
    const script = Buffer.from(windowsWatchMemoryArgs.at(-1)!, 'base64').toString('utf16le')
    expect(script.indexOf('observer-ready')).toBeLessThan(script.indexOf('ConvertFrom-Json'))
    expect(script.slice(0, script.indexOf('observer-ready'))).not.toContain('ConvertTo-Json')
    expect(script).toContain('taro-build-runner\\.mjs\\s+build\\s+--type\\s+\\S+\\s+--watch')
    expect(script).toContain('WorkingSetSize,CommandLine')
  })

  it.each([{ args: windowsObserverArgs }, { args: windowsWatchMemoryArgs }])('ends only its owned PowerShell host after the EOF request loop', ({ args }) => {
    const script = Buffer.from(args.at(-1)!, 'base64').toString('utf16le')
    expect(script.trimEnd().endsWith(windowsObserverShutdownScript.trim())).toBe(true)
    const eof = script.indexOf('while ($null -ne ($line = [Console]::In.ReadLine()))')
    const shutdown = script.indexOf('observer-stopped')
    expect(eof).toBeGreaterThan(-1)
    expect(shutdown).toBeGreaterThan(eof)
    expect(script.slice(eof, shutdown)).toContain('error = $_.Exception.Message')
    expect(script).toContain('[Environment]::Exit(0)')
    expect(script).not.toContain('Stop-Process')
  })

  it('reaps a real Node provider after repeated actual memory responses from one held PID', async () => {
    const { spawn: realSpawn } = await import('node:child_process')
    let held: ChildProcess | undefined
    const script = `const readline=require('node:readline');
      const send=value=>process.stdout.write(JSON.stringify(value)+'\\n');
      send({event:'observer-ready',pid:process.pid});
      readline.createInterface({input:process.stdin}).on('line',line=>{
        const request=JSON.parse(line);
        for(const event of ['request-received','query-completed','response-ready']) send({event,id:request.id,kind:request.kind});
        const rssMb=Math.round(process.memoryUsage().rss/1024/1024);
        send({id:request.id,rows:{rssMb,maxProcessRssMb:rssMb,processCount:1,topProcesses:[{pid:process.pid,ppid:process.ppid,rssMb}]}});
      });`
    const createChild = vi.fn((...args: Parameters<typeof realSpawn>) => {
      held = realSpawn(...args)
      return held
    })
    const source = await prepareWatchMemorySource(process.cwd(), { platform: 'win32', command: process.execPath, args: ['-e', script], spawn: createChild as typeof spawn })
    try {
      for (let i = 0; i < 3; i++) {
        const value = await source.sample(held!.pid, new AbortController().signal)
        expect(value.rssMb).toBeGreaterThan(0)
        expect(value.topProcesses![0]!.pid).toBe(held!.pid)
      }
      expect(createChild).toHaveBeenCalledOnce()
    }
    finally {
      await source.close()
    }
    expect(held!.exitCode).toBe(0)
  })
})

describe('business spawn ownership', () => {
  it.each([false, true])('closes the prepared source when spawn fails, close failure=%s', async (closeFails) => {
    const primary = new Error('business spawn failed')
    const closeError = new Error('source close failed')
    const source: WatchMemorySource = { sample: vi.fn(), close: vi.fn(async () => {
      if (closeFails) {
        throw closeError
      }
    }) }
    const prepare = vi.fn(async () => source)
    const error = await spawnWithWatchMemorySource('repo', () => {
      throw primary
    }, prepare).catch(error => error)
    expect(source.close).toHaveBeenCalledOnce()
    if (closeFails) {
      expect(error.errors).toEqual([primary, closeError])
    }
    else { expect(error).toBe(primary) }
  })
})

describe('single-shot fixture launch environment', () => {
  it.each([
    ['win32', String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`, true],
    ['win32', 'powershell', true],
    ['win32', 'pwsh', false],
    ['win32', 'custom-probe', false],
    ['linux', 'powershell', false],
  ] as const)('keeps the parent environment and applies only the %s / %s child policy', async (platform, command, reset) => {
    const child = provider().child
    const env = { PSModulePath: 'pwsh-modules', pSmOdUlEpAtH: 'other-modules', PATH: 'parent-path' }
    const spawnProcess = vi.fn((..._args: Parameters<typeof spawn>) => child as unknown as ChildProcess)
    const pending = runMemoryProbe(command, [], { signal: new AbortController().signal, timeoutMs: 1000, spawnProcess: spawnProcess as typeof spawn, launchOptions: { platform, env } })
    child.emit('close', 0)
    await pending
    const options = spawnProcess.mock.calls[0]![2]!
    expect(options.env).toEqual(reset ? { PATH: 'parent-path' } : env)
    expect(env).toEqual({ PSModulePath: 'pwsh-modules', pSmOdUlEpAtH: 'other-modules', PATH: 'parent-path' })
    expect(options).toMatchObject({ shell: false, windowsHide: true })
  })
})
