import type { ChildProcess, spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
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
  const marker = (line = lines[0]!) => send({ event: 'request-line-received', pid: child.pid, line: Buffer.from(line).toString('base64') })
  return { child, lines, send, marker, transport }
}

afterEach(() => vi.useRealTimers())

it('精确标记已经读入的原始行，后续 JSON 解析和查询仍属于同一请求', async () => {
  const { transport, marker, send } = provider()
  const request = transport.request({ kind: 'memory', rootPid: 7, cwd: String.raw`C:\中文 & space` }, 5000)
  marker()
  expect(transport.diagnostics().requests[0]!.stages.map(item => item.stage)).toContain('request-line-received')
  for (const event of ['request-received', 'query-completed', 'response-ready']) {
    send({ event, id: 1, kind: 'memory' })
  }
  send({ id: 1, rows: { measured: true } })
  await expect(request).resolves.toEqual({ measured: true })
  await transport.close()
})

it.each(['changed-content', 'duplicate', 'invalid-base64', 'wrong-pid', 'after-parse'])('原始行标记拒绝 %s，不能猜测或借用请求身份', async (mode) => {
  const { transport, marker, send, lines } = provider()
  const request = transport.request({ kind: 'memory', rootPid: 7, cwd: 'repo' }, 5000)
  const rejected = expect(request).rejects.toThrow()
  if (mode === 'changed-content') {
    marker(lines[0]!.replace('"rootPid":7', '"rootPid":8'))
  }
  else if (mode === 'duplicate') {
    marker()
    marker()
  }
  else if (mode === 'wrong-pid') {
    send({ event: 'request-line-received', pid: 43, line: Buffer.from(lines[0]!).toString('base64') })
  }
  else if (mode === 'after-parse') {
    send({ event: 'request-received', id: 1, kind: 'memory' })
    marker()
  }
  else {
    send({ event: 'request-line-received', pid: 42, line: '!!!!' })
  }
  await rejected
  await expect(transport.close()).rejects.toThrow()
})

it('已读行不会续借 JSON 解析或查询的绝对截止', async () => {
  vi.useFakeTimers()
  const { transport, marker, child } = provider()
  const rejected = expect(transport.request({ kind: 'identity' }, 5000)).rejects.toThrow('timeoutMs=5000')
  await vi.advanceTimersByTimeAsync(4999)
  marker()
  await vi.advanceTimersByTimeAsync(1)
  await rejected
  expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  await expect(transport.close()).rejects.toThrow('timeoutMs=5000')
})

it.each([{ args: windowsObserverArgs }, { args: windowsWatchMemoryArgs }])('原生脚本在首个 JSON cmdlet 前冲刷已读行，JSON 模块只按宿主 manifest 加载', ({ args }) => {
  const script = Buffer.from(args.at(-1)!, 'base64').toString('utf16le')
  const read = script.indexOf('[Console]::In.ReadLine()')
  const marker = script.indexOf('request-line-received')
  const parse = script.indexOf('Microsoft.PowerShell.Utility\\ConvertFrom-Json')
  expect(marker).toBeGreaterThan(read)
  expect(parse).toBeGreaterThan(marker)
  expect(script.slice(marker, parse)).toContain('[Console]::Out.Flush()')
  expect(script).toContain('[System.IO.Path]::Combine($PSHOME,')
  expect(script).toContain('Import-Module -Name $observerJsonManifest -ErrorAction Stop')
  expect(script.indexOf('Import-Module -Name $observerJsonManifest')).toBeGreaterThan(marker)
  expect(script).not.toMatch(/(?<![\\\w-])ConvertFrom-Json\s+-InputObject/)
})
