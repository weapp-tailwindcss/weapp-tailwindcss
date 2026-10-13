import type { ChildProcess, spawn } from 'node:child_process'
import { spawn as spawnNative } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
import { createProcessObserverTransport } from '../scripts/demo-e2e-workflow/process-observer/transport'

function provider() {
  const child = Object.assign(new EventEmitter(), {
    pid: 424242,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', null, 'SIGKILL'))
      return true
    }),
  })
  const createChild = vi.fn(() => child as unknown as ChildProcess) as unknown as typeof spawn
  const transport = createProcessObserverTransport('fixture', [], createChild)
  const send = (value: unknown) => child.stdout.write(`${JSON.stringify(value)}\n`)
  send({ event: 'observer-ready', pid: child.pid })
  const stopped = () => send({ event: 'observer-stopped', pid: child.pid })
  return { child, transport, send, stopped }
}

afterEach(() => vi.useRealTimers())

it('正常 EOF 的本体停止诊断仍等待真实 close，并保存退出阶段', async () => {
  const { child, transport, stopped } = provider()
  const closing = transport.close()
  await Promise.resolve()
  stopped()
  let resolved = false
  void closing.then(() => resolved = true)
  child.emit('exit', 0, null)
  await Promise.resolve()
  expect(resolved).toBe(false)
  child.emit('close', 0, null)
  await closing
  expect(child.kill).not.toHaveBeenCalled()
  expect(transport.diagnostics().shutdown.map(stage => stage.stage)).toEqual(['stdin-end-requested', 'observer-stopped', 'exit', 'close'])
  const snapshot = transport.diagnostics()
  snapshot.shutdown[0]!.elapsedMs = -1
  expect(transport.diagnostics().shutdown[0]!.elapsedMs).toBeGreaterThanOrEqual(0)
})

it('停止诊断和 exit 都不能代替 close 或延长原 1 秒退出确认', async () => {
  vi.useFakeTimers()
  const { child, transport, stopped } = provider()
  const closing = transport.close().catch(error => error)
  await vi.advanceTimersByTimeAsync(999)
  stopped()
  child.emit('exit', 0, null)
  await vi.advanceTimersByTimeAsync(1)
  const error = await closing
  expect(String(error)).toContain('退出未确认')
  expect(String(error)).toContain('observer-stopped')
  expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  expect(transport.diagnostics().shutdown.at(-1)).toMatchObject({ stage: 'close', signal: 'SIGKILL' })
  await expect(transport.close()).rejects.toBe(error)
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['active', 'wrong-pid', 'duplicate', 'corrupt-tail', 'stream-error', 'exit-failure'] as const)('停止诊断不能掩盖 %s', async (kind) => {
  const { child, transport, send, stopped } = provider()
  let closing: Promise<unknown>
  if (kind === 'active') {
    stopped()
    closing = transport.close().catch(error => error)
  }
  else {
    closing = transport.close().catch(error => error)
    await Promise.resolve()
    if (kind === 'wrong-pid') {
      send({ event: 'observer-stopped', pid: child.pid + 1 })
    }
    else {
      stopped()
      if (kind === 'duplicate') {
        stopped()
      }
      if (kind === 'corrupt-tail') {
        child.stdout.write('invalid-json\n')
      }
      if (kind === 'stream-error') {
        child.stdout.emit('error', new Error('shutdown-stream-failed'))
      }
      if (kind === 'exit-failure') {
        child.emit('close', 1, null)
      }
    }
  }
  const error = await closing
  expect(error).toBeInstanceOf(Error)
  await expect(transport.close()).rejects.toBe(error)
  expect(child.kill.mock.calls.length).toBeLessThanOrEqual(1)
})

it.each([
  ['timeout', false],
  ['timeout', true],
  ['abort', false],
  ['abort', true],
] as const)('停止诊断不覆盖 %s 首错，实际 close=%s', async (kind, confirmed) => {
  vi.useFakeTimers()
  const { child, transport, stopped } = provider()
  child.kill.mockImplementation(() => true)
  const controller = new AbortController()
  const reading = transport.request({ kind: 'identity' }, 5000, controller.signal).catch(error => error)
  const primary = new Error('intentional-owned-stop')
  if (kind === 'timeout') {
    await vi.advanceTimersByTimeAsync(5000)
  }
  else {
    controller.abort(primary)
  }
  stopped()
  if (confirmed) {
    child.emit('close', null, 'SIGKILL')
  }
  else {
    await vi.advanceTimersByTimeAsync(1000)
  }
  const error = await reading
  const firstError = confirmed ? error : error.errors[0]
  if (kind === 'timeout') {
    expect(String(firstError)).toContain('请求超时')
  }
  else {
    expect(firstError).toBe(primary)
  }
  if (!confirmed) {
    expect(String(error.errors[1])).toContain('退出未确认')
  }
  await expect(transport.close()).rejects.toBe(error)
  expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  expect(transport.diagnostics().shutdown.map(stage => stage.stage)).toEqual(confirmed ? ['terminate-requested', 'close'] : ['terminate-requested'])
  expect(vi.getTimerCount()).toBe(0)
  if (!confirmed) {
    child.emit('close', null, 'SIGKILL')
  }
})

it.each([false, true])('真实自建宿主的 EOF 不替代退出，明确结束本体=%s', async (explicitExit) => {
  const script = `
    const send=value=>process.stdout.write(JSON.stringify(value)+'\\n');
    send({event:'observer-ready',pid:process.pid});
    setInterval(()=>{},60000);
    require('node:readline').createInterface({input:process.stdin})
      .on('line',line=>{const request=JSON.parse(line);send({id:request.id,rows:[]});})
      .on('close',()=>{send({event:'observer-stopped',pid:process.pid});${explicitExit ? 'process.stdout.write(\'\',()=>process.exit(0));' : ''}});
  `
  let held: ChildProcess | undefined
  const createChild = vi.fn((...args: Parameters<typeof spawnNative>) => {
    held = spawnNative(...args)
    vi.spyOn(held, 'kill')
    return held
  })
  const transport = createProcessObserverTransport(process.execPath, ['-e', script], createChild as typeof spawn)
  try {
    await transport.waitUntilReady(5000)
    expect(await transport.request({ kind: 'identity' }, 5000)).toEqual([])
    expect(await transport.request({ kind: 'identity' }, 5000)).toEqual([])
  }
  finally {
    if (explicitExit) {
      await transport.close()
    }
    else {
      await expect(transport.close()).rejects.toThrow('退出未确认')
    }
  }
  expect(createChild).toHaveBeenCalledOnce()
  if (explicitExit) {
    expect(held!.kill).not.toHaveBeenCalled()
    expect(held!.exitCode).toBe(0)
    expect(held!.signalCode).toBeNull()
    expect(transport.diagnostics().shutdown.map(stage => stage.stage)).toEqual(['stdin-end-requested', 'observer-stopped', 'exit', 'close'])
  }
  else {
    expect(held!.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
    expect(transport.diagnostics().shutdown.map(stage => stage.stage)).toEqual(['stdin-end-requested', 'observer-stopped', 'terminate-requested', 'exit', 'close'])
    expect(transport.diagnostics().shutdown.at(-1)).toMatchObject({ stage: 'close' })
    await expect(transport.close()).rejects.toThrow('退出未确认')
  }
})
