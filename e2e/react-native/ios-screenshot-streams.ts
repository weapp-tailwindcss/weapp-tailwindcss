import type { ResultPromise } from 'execa'

interface StreamState {
  atMs: number
  destroyed: boolean
  closed: boolean
  ended: boolean
  error?: string
}

interface StreamDiagnostic {
  direction: 'input' | 'output'
  observed: boolean
  events: { end?: number, finish?: number, close?: number }
  started?: StreamState
  exited?: StreamState
  settled?: StreamState
}

/** 只观察自有 stdio，不读取、恢复、关闭或销毁流，也不接管错误事件。 */
export function observeIosScreenshotStreams(command: ResultPromise, elapsed: () => number) {
  const records: Record<'stdin' | 'stdout' | 'stderr', StreamDiagnostic> = {
    stdin: { direction: 'input', observed: false, events: {} },
    stdout: { direction: 'output', observed: false, events: {} },
    stderr: { direction: 'output', observed: false, events: {} },
  }
  const observers = (['stdin', 'stdout', 'stderr'] as const).map((name) => {
    const stream = command[name]
    const record = records[name]
    if (!stream) {
      return undefined
    }
    record.observed = true
    const events = name === 'stdin' ? ['finish', 'close'] as const : ['end', 'close'] as const
    const listeners = events.map((event) => {
      const listener = () => {
        record.events[event] = elapsed()
      }
      stream.once(event, listener)
      return { event, listener }
    })
    return {
      snapshot(stage: 'started' | 'exited' | 'settled') {
        record[stage] = {
          atMs: elapsed(),
          destroyed: stream.destroyed,
          closed: stream.closed,
          ended: name === 'stdin' ? command.stdin!.writableFinished : command[name]!.readableEnded,
          ...(stream.errored ? { error: String(stream.errored) } : {}),
        }
      },
      dispose() {
        for (const { event, listener } of listeners) {
          stream.removeListener(event, listener)
        }
      },
    }
  })
  const snapshot = (stage: 'started' | 'exited' | 'settled') => {
    for (const observer of observers) {
      observer?.snapshot(stage)
    }
  }
  snapshot('started')
  return {
    records,
    snapshot,
    dispose() {
      for (const observer of observers) {
        observer?.dispose()
      }
    },
  }
}
