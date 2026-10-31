import type { ChildProcess, spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
import { observerInputStages } from '../../../scripts/demo-e2e-workflow/process-observer/input'
import { windowsObserverInputFailureScript, windowsObserverInputProgress } from '../../../scripts/demo-e2e-workflow/process-observer/input-script'
import { windowsObserverArgs } from '../../../scripts/demo-e2e-workflow/process-observer/script'
import { createProcessObserverTransport } from '../../../scripts/demo-e2e-workflow/process-observer/transport'
import { windowsWatchMemoryArgs } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/windows'

function provider() {
  const child = Object.assign(new EventEmitter(), { pid: 42, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
  const lines: string[] = []
  child.stdin.on('data', chunk => lines.push(chunk.toString().trimEnd()))
  child.stdin.on('finish', () => queueMicrotask(() => child.emit('close', 0, null)))
  child.kill.mockImplementation(() => {
    queueMicrotask(() => child.emit('close', null, 'SIGKILL'))
    return true
  })
  const send = (message: unknown) => child.stdout.write(`${JSON.stringify(message)}\n`)
  const transport = createProcessObserverTransport('fixture', [], (() => child as unknown as ChildProcess) as typeof spawn)
  send({ event: 'observer-ready', pid: child.pid })
  const raw = (index = 0) => ({ pid: child.pid, line: Buffer.from(lines[index]!).toString('base64') })
  const marker = () => send({ event: 'request-line-received', ...raw() })
  const stage = (index: number) => send({ event: 'request-input-progress', ...raw(), stage: observerInputStages[index] })
  return { child, lines, send, raw, marker, stage, transport }
}

afterEach(() => vi.useRealTimers())

it('以原始请求绑定模块、JSON和回执的独立阶段，仍完成原成功协议', async () => {
  const f = provider()
  const pending = f.transport.request({ kind: 'prepare', rootPid: 42, cwd: 'repo' }, 5000)
  f.marker()
  for (let index = 0; index < observerInputStages.length - 1; index++) {
    f.stage(index)
  }
  f.send({ event: 'request-received', id: 1, kind: 'prepare' })
  f.stage(observerInputStages.length - 1)
  for (const event of ['query-completed', 'response-ready']) {
    f.send({ event, id: 1, kind: 'prepare' })
  }
  f.send({ id: 1, rows: { prepared: true } })
  await expect(pending).resolves.toEqual({ prepared: true })
  const stages = f.transport.diagnostics().requests[0]!.stages.map(item => item.stage)
  for (const stage of observerInputStages) {
    expect(stages).toContain(stage)
  }
  expect(stages.indexOf('request-ack-write-start')).toBeLessThan(stages.indexOf('request-received'))
  expect(stages.indexOf('request-received')).toBeLessThan(stages.indexOf('request-ack-flushed'))
  expect(f.child.kill).not.toHaveBeenCalled()
  await f.transport.close()
})

it.each([0, 2, 4, 5, 6])('输入在第%s段失败时不依赖JSON错误序列化，保留原始中文错误并回收宿主', async (failedAt) => {
  const f = provider()
  const nativeError = '原生错误：模块或 JSON 异常 "中文"'
  const pending = f.transport.request({ kind: 'prepare', rootPid: 42, cwd: 'repo' }, 5000)
  const rejected = expect(pending).rejects.toThrow(nativeError)
  f.marker()
  for (let index = 0; index <= failedAt; index++) {
    f.stage(index)
  }
  f.send({ event: 'request-input-failed', ...f.raw(), stage: observerInputStages[failedAt], error: Buffer.from(nativeError).toString('base64') })
  await rejected
  expect(f.transport.diagnostics().requests[0]!.stages.map(item => item.stage)).toContain(`input-failed:${observerInputStages[failedAt]}`)
  expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  await expect(f.transport.close()).rejects.toThrow(`stage=${observerInputStages[failedAt]}`)
})

it.each(['changed-content', 'wrong-pid', 'duplicate-stage', 'wrong-order', 'after-ack', 'invalid-error'])('输入子阶段拒绝%s，不能借用身份、错序或伪造失败', async (mode) => {
  const f = provider()
  const pending = f.transport.request({ kind: 'prepare', rootPid: 42, cwd: 'repo' }, 5000)
  const rejected = expect(pending).rejects.toThrow()
  f.marker()
  if (mode === 'changed-content') {
    const line = f.lines[0]!.replace('"rootPid":42', '"rootPid":43')
    f.send({ event: 'request-input-progress', pid: 42, line: Buffer.from(line).toString('base64'), stage: observerInputStages[0] })
  }
  else if (mode === 'wrong-pid') {
    f.send({ event: 'request-input-progress', ...f.raw(), pid: 43, stage: observerInputStages[0] })
  }
  else if (mode === 'duplicate-stage') {
    f.stage(0)
    f.stage(0)
  }
  else if (mode === 'wrong-order') {
    f.stage(1)
  }
  else if (mode === 'after-ack') {
    for (let index = 0; index < observerInputStages.length - 1; index++) {
      f.stage(index)
    }
    f.send({ event: 'request-received', id: 1, kind: 'prepare' })
    f.stage(1)
  }
  else {
    f.send({ event: 'request-input-failed', ...f.raw(), stage: observerInputStages[0], error: '!!!!' })
  }
  await rejected
  expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  await expect(f.transport.close()).rejects.toThrow()
})

it('模块子阶段进度不续借既有请求截止', async () => {
  vi.useFakeTimers()
  const f = provider()
  const rejected = expect(f.transport.request({ kind: 'prepare', rootPid: 42, cwd: 'repo' }, 5000)).rejects.toThrow('timeoutMs=5000')
  f.marker()
  await vi.advanceTimersByTimeAsync(4999)
  f.stage(0)
  await vi.advanceTimersByTimeAsync(1)
  await rejected
  expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  await expect(f.transport.close()).rejects.toThrow('timeoutMs=5000')
  expect(vi.getTimerCount()).toBe(0)
})

it.each([{ args: windowsObserverArgs }, { args: windowsWatchMemoryArgs }])('两个宿主每轮先清空请求，首轮诊断与输入失败都避开JSON依赖', ({ args }) => {
  const script = Buffer.from(args.at(-1)!, 'base64').toString('utf16le')
  const read = script.indexOf('[Console]::In.ReadLine()')
  const reset = script.indexOf('$request = $null', read)
  const marker = script.indexOf('request-line-received', reset)
  expect(reset).toBeGreaterThan(read)
  expect(marker).toBeGreaterThan(reset)
  expect(script.slice(reset, marker)).toContain('$observerInputComplete = $false')
  expect(script.slice(reset, marker)).toContain('$observerInputTrace = -not $observerJsonLoaded')
  expect(script).toContain('if (-not $observerInputComplete)')
  expect(script.indexOf('$observerInputComplete = $true')).toBeGreaterThan(script.indexOf('$observerInputStage = \'request-ack-flushed\''))
  for (const stage of observerInputStages) {
    const markerScript = windowsObserverInputProgress(stage)
    expect(markerScript).toContain('if ($observerInputTrace)')
    expect(markerScript).not.toMatch(/Convert(?:From|To)-Json|Import-Module/)
  }
  expect(windowsObserverInputFailureScript).toContain('[Environment]::Exit(1)')
  expect(windowsObserverInputFailureScript).not.toMatch(/Convert(?:From|To)-Json|Import-Module|\$request\.id/)
})

it('上轮原始行的失败不能绑定到下一轮请求，即使上轮ID曾经合法', async () => {
  const f = provider()
  const first = f.transport.request({ kind: 'identity' }, 5000)
  f.send({ id: 1, rows: [] })
  await first
  const second = f.transport.request({ kind: 'identity' }, 5000)
  const rejected = expect(second).rejects.toThrow('不属于本轮在途请求')
  f.send({ event: 'request-line-received', ...f.raw(1) })
  f.send({ event: 'request-input-failed', ...f.raw(0), stage: observerInputStages[0], error: Buffer.from('stale').toString('base64') })
  await rejected
  expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  await expect(f.transport.close()).rejects.toThrow('不属于本轮在途请求')
})
