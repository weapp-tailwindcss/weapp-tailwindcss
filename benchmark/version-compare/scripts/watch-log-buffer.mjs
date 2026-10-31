import { Buffer } from 'node:buffer'

export function createWatchLogBuffer(limit = 600) {
  const lines = []
  const pending = new Map()
  let round

  const collect = (buf, stream = 'stdout') => {
    let offset = 0
    while (offset < buf.length) {
      let partial = pending.get(stream)
      if (!partial) {
        // 首字节决定操作归属，包括尚不能解码的 UTF-8 字节。
        partial = { parts: [], round }
        pending.set(stream, partial)
      }
      const end = buf.indexOf(10, offset)
      if (end === -1) {
        partial.parts.push(Buffer.from(buf.subarray(offset)))
        return
      }
      partial.parts.push(buf.subarray(offset, end))
      const line = Buffer.concat(partial.parts).toString('utf8').replace(/\r$/, '')
      pending.delete(stream)
      offset = end + 1
      if (!line) {
        continue
      }
      lines.push(line)
      if (lines.length > limit) {
        lines.shift()
      }
      partial.round?.lines.push(line)
      if (stream === 'stdout') {
        partial.round?.stdoutLines.push(line)
      }
    }
  }

  const beginRound = () => {
    const current = { lines: [], stdoutLines: [] }
    round = current
    return {
      ...current,
      close() {
        if (round === current) {
          round = undefined
        }
      },
    }
  }

  return {
    beginRound,
    collect,
    lines,
  }
}
