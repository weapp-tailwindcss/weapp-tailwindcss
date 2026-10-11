import type { ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { finished } from 'node:stream/promises'

/** 原始日志独立落盘，不依赖用于错误摘要的有界内存缓冲。 */
export function captureNativeLog(child: Pick<ChildProcess, 'stdout' | 'stderr'>, file: string) {
  const stream = createWriteStream(file)
  const completion = finished(stream).then(() => undefined, (error: unknown) => error)
  const write = (chunk: string | Uint8Array) => {
    stream.write(chunk)
  }
  child.stdout?.on('data', write)
  child.stderr?.on('data', write)
  return {
    async close() {
      child.stdout?.off('data', write)
      child.stderr?.off('data', write)
      stream.end()
      const error = await completion
      if (error) {
        throw error
      }
    },
  }
}
