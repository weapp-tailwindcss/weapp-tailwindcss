import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const maxWorkerOutputBytes = 2 * 1024 * 1024

/** 保存拥有进程的完整原始字节；超限明确失败，不把前缀当作完整 trace。 */
export function captureWorkerOutput(child, directory, onFailure) {
  const file = 'worker-output.ndjson'
  const hash = createHash('sha256')
  let fd
  let bytes = 0
  let chunks = 0
  let complete = false
  let recordingError
  let stopped = false
  const streams = []

  function stop(error) {
    if (stopped) {
      return
    }
    stopped = true
    for (const [stream, listener] of streams) {
      stream.off('data', listener)
    }
    try {
      if (fd !== undefined) {
        fs.closeSync(fd)
      }
    }
    catch (closeError) {
      error ??= closeError
    }
    if (error) {
      recordingError = error instanceof Error ? error.message : String(error)
      onFailure(error)
    }
  }

  function append(stream, data) {
    if (stopped) {
      return
    }
    try {
      const payload = Buffer.from(`${JSON.stringify({ stream, atEpochMs: Date.now(), base64: Buffer.from(data).toString('base64') })}\n`)
      if (bytes + payload.length > maxWorkerOutputBytes) {
        throw new Error('GC trace 原始输出超过 2 MiB 固定上限')
      }
      let offset = 0
      while (offset < payload.length) {
        const written = fs.writeSync(fd, payload, offset, payload.length - offset)
        if (written === 0) {
          throw new Error('GC trace 写入没有进展')
        }
        offset += written
      }
      hash.update(payload)
      bytes += payload.length
      chunks += 1
    }
    catch (error) {
      stop(error)
    }
  }

  try {
    fd = fs.openSync(path.join(directory, file), 'wx')
    for (const name of ['stdout', 'stderr']) {
      if (child[name]) {
        const listener = data => append(name, data)
        streams.push([child[name], listener])
        child[name].on('data', listener)
      }
    }
    child.once('close', () => {
      if (!stopped) {
        complete = true
      }
      stop()
    })
  }
  catch (error) {
    stop(error)
  }
  return {
    finish() {
      stop()
      return { file, bytes, chunks, sha256: hash.copy().digest('hex'), maxBytes: maxWorkerOutputBytes, complete: complete && !recordingError, recordingError }
    },
  }
}
