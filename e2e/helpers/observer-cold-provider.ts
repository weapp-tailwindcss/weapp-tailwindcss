import type { ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { vi } from 'vitest'
import { observerPreparation } from './observer-preparation'

/** 分别控制宿主、模块和查询耗时，确定性验证准备截止与业务放行边界。 */
export function createColdObserverProvider(hostMs = 12_000, moduleMs = 3000, queryMs = 4000) {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      fn()
    }, ms)
    timers.add(timer)
  }
  const child = Object.assign(new EventEmitter(), {
    pid: 424242,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', null, 'SIGKILL'))
      return true
    }),
  }) as unknown as ChildProcess & { stdin: PassThrough, stdout: PassThrough, stderr: PassThrough, kill: ReturnType<typeof vi.fn> }
  child.once('close', () => {
    for (const timer of timers) {
      clearTimeout(timer)
    }
  })
  const requests: Array<{ id: number, kind: string, sentAt: number }> = []
  const queued: typeof requests = []
  const send = (value: unknown) => child.stdout.write(`${JSON.stringify(value)}\n`)
  const respond = (request: typeof requests[number]) => {
    send({ event: 'request-received', id: request.id, kind: request.kind })
    later(() => {
      send({ event: 'query-completed', id: request.id, kind: request.kind })
      send({ event: 'response-ready', id: request.id, kind: request.kind })
      const identity = { pid: child.pid!, parent: 1, group: 0, started: '2026-10-13T00:00:00Z' }
      let rows: unknown = { rssMb: 10, maxProcessRssMb: 10, processCount: 1, topProcesses: [{ pid: child.pid, ppid: 1, rssMb: 10 }] }
      if (request.kind === 'prepare') {
        rows = observerPreparation(identity)
      }
      else if (request.kind === 'identity') {
        rows = [identity]
      }
      send({ id: request.id, rows })
    }, queryMs)
  }
  let serving = false
  child.stdin.on('data', (data) => {
    const request = { ...JSON.parse(String(data)), sentAt: Date.now() }
    requests.push(request)
    if (serving) {
      respond(request)
    }
    else {
      queued.push(request)
    }
  })
  child.stdin.on('finish', () => queueMicrotask(() => child.emit('close', 0, null)))
  const createChild = vi.fn(() => {
    later(() => {
      send({ event: 'observer-ready', pid: child.pid })
      later(() => {
        serving = true
        for (const request of queued.splice(0)) {
          respond(request)
        }
      }, moduleMs)
    }, hostMs)
    return child
  }) as unknown as typeof spawn
  return { child, requests, createChild, send }
}
