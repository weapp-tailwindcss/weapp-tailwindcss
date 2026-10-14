import type { Buffer } from 'node:buffer'
import type { WatchCompileState } from './types'
import { StringDecoder } from 'node:string_decoder'

const BUILD_STATE_PREFIX = '[uni-e2e-watch:build] '

export function createPollingCompileTracker() {
  let state: WatchCompileState | undefined
  return {
    observe(line: string, at: number) {
      if (!state && line.startsWith('[uni-e2e-watch] mode=')) {
        state = { generation: 0, building: true, idleAt: 0 }
      }
      if (!line.startsWith(BUILD_STATE_PREFIX)) {
        return
      }
      let payload: { generation?: unknown, status?: unknown }
      try {
        payload = JSON.parse(line.slice(BUILD_STATE_PREFIX.length))
      }
      catch {
        return
      }
      if (!payload || !Number.isSafeInteger(payload.generation) || Number(payload.generation) <= 0) {
        return
      }
      const generation = Number(payload.generation)
      if (payload.status === 'start' && generation > (state?.generation ?? 0)) {
        state = { generation, building: true, idleAt: state?.idleAt ?? 0 }
      }
      else if (payload.status === 'idle' && state?.building && generation === state.generation) {
        state = { generation, building: false, idleAt: at }
      }
    },
    current: () => state,
  }
}

export function createLogLineBuffer(consume: (line: string) => void) {
  const decoder = new StringDecoder('utf8')
  let pending = ''
  const collect = (chunk: Buffer | string) => {
    pending += typeof chunk === 'string' ? chunk : decoder.write(chunk)
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) {
      consume(line)
    }
  }
  return Object.assign(collect, {
    flush() {
      pending += decoder.end()
      if (pending) {
        consume(pending)
        pending = ''
      }
    },
  })
}
