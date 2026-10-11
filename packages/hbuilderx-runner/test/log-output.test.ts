import { Buffer } from 'node:buffer'
import { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { PassThrough } from 'node:stream'
import { expect, it } from 'vitest'
import { classifyHBuilderXOutput, collectProcessOutput } from '../src/logs'

it('子进程 UTF-8 日志在任意字节处拆分时仍保留中文错误分类', async () => {
  const message = '项目 中文 & 空格 不是 uni-app 项目\r\n'
  const bytes = Buffer.from(message)
  for (let boundary = 1; boundary < bytes.length; boundary++) {
    const stdout = new PassThrough()
    const ended = once(stdout, 'end')
    const logs = collectProcessOutput(Object.assign(new ChildProcess(), { stdout }))
    stdout.write(bytes.subarray(0, boundary))
    stdout.end(bytes.subarray(boundary))
    await ended
    expect(logs.join(''), `字节边界 ${boundary}`).toBe(message)
    expect(classifyHBuilderXOutput(logs.join('')).kind).toBe('project-not-uni-app')
  }
})

it('stdout 与 stderr 交错的多字节片段分别解码', async () => {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const ended = Promise.all([once(stdout, 'end'), once(stderr, 'end')])
  const logs = collectProcessOutput(Object.assign(new ChildProcess(), { stdout, stderr }))
  const out = Buffer.from('中文')
  const err = Buffer.from('错误')
  stdout.write(out.subarray(0, 1))
  stderr.write(err.subarray(0, 2))
  stdout.end(out.subarray(1))
  stderr.end(err.subarray(2))
  await ended
  expect(logs.join('')).toBe('中文错误')
})
