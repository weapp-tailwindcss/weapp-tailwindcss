import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { createWatchLogBuffer } from '../scripts/watch-log-buffer.mjs'

describe('watch 日志完整行', () => {
  it('按流重组分块，不把 stderr 插到 stdout 的半行中', () => {
    const buffer = createWatchLogBuffer()
    const round = buffer.beginRound()
    buffer.collect(Buffer.from('[weapp-tailwindcss:hmr] {"duration'), 'stdout')
    buffer.collect(Buffer.from('diagnostic\n'), 'stderr')
    buffer.collect(Buffer.from('Ms":23}\n'), 'stdout')
    expect(round.lines).toEqual(['diagnostic', '[weapp-tailwindcss:hmr] {"durationMs":23}'])
    expect(round.stdoutLines).toEqual(['[weapp-tailwindcss:hmr] {"durationMs":23}'])
  })

  it('保留跨分块的 UTF-8 和 CRLF，只发布完整行', () => {
    const buffer = createWatchLogBuffer()
    const bytes = Buffer.from('开始差量编译...\r\nDONE\n')
    buffer.collect(bytes.subarray(0, 1))
    expect(buffer.lines).toEqual([])
    buffer.collect(bytes.subarray(1, bytes.length - 2))
    expect(buffer.lines).toEqual(['开始差量编译...'])
    buffer.collect(bytes.subarray(bytes.length - 2))
    expect(buffer.lines).toEqual(['开始差量编译...', 'DONE'])
  })

  it('不把操作开始前的半行归入后续操作', () => {
    const buffer = createWatchLogBuffer()
    buffer.collect(Buffer.from('old timing'))
    const mutation = buffer.beginRound()
    buffer.collect(Buffer.from(' completed\nnew timing\nrollback'))
    mutation.close()
    const rollback = buffer.beginRound()
    buffer.collect(Buffer.from(' stale\nnew rollback\n'))
    expect(mutation.lines).toEqual(['new timing', 'rollback stale'])
    expect(rollback.lines).toEqual(['new rollback'])
    expect(buffer.lines).toEqual(['old timing completed', 'new timing', 'rollback stale', 'new rollback'])
  })

  it('完整行仍遵守历史窗口上限', () => {
    const buffer = createWatchLogBuffer(2)
    buffer.collect(Buffer.from('one\ntwo\nthree\npartial'))
    expect(buffer.lines).toEqual(['two', 'three'])
  })

  it('UTF-8 首字节在操作前收到时，不把解码后的旧行归入新操作', () => {
    const buffer = createWatchLogBuffer()
    const bytes = Buffer.from('开始差量编译...\n')
    buffer.collect(bytes.subarray(0, 1))
    const round = buffer.beginRound()
    buffer.collect(bytes.subarray(1))
    expect(round.stdoutLines).toEqual([])
    expect(buffer.lines).toEqual(['开始差量编译...'])
  })
})
