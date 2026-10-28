import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it } from 'vitest'
import { limits } from '../scripts/diagnostics/constants.mjs'
import { describeFailure, runWithCleanup } from '../scripts/diagnostics/failures.mjs'
import { createWorkerEvidence } from '../scripts/diagnostics/worker-evidence.mjs'

const roots = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))) })

it.each([false, undefined, null, 0, new Error('run first')])('首错 %s 不被收尾覆盖，全部收尾仍执行且cause按原值保留', async (primary) => {
  const second = new Error('stop failed')
  const third = new Error('diagnostics failed')
  const calls = []
  const failure = await runWithCleanup(() => { throw primary }, [
    () => { calls.push('stop'); throw second },
    outcome => { expect(outcome.error).toBe(primary); expect(outcome.failures).toEqual([primary, second]); calls.push('finish'); throw third },
    () => calls.push('restore'),
  ]).catch(error => error)
  expect(failure).toBeInstanceOf(AggregateError)
  expect(failure.errors).toEqual([primary, second, third])
  expect(failure.cause).toBe(primary)
  expect(calls).toEqual(['stop', 'finish', 'restore'])
})

it('真实Node worker归档原始stdout/stderr、实际退出及首错完整cause链', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-raw-output-'))
  roots.push(directory)
  const worker = createWorkerEvidence(directory)
  const child = spawn(process.execPath, ['--input-type=module', '-e', "process.stdout.write(Buffer.from([0,255,13,10])); process.stderr.write('first failure 中文\\r\\n'); process.exitCode=2"], { stdio: ['ignore', 'pipe', 'pipe'] })
  worker.attach(child)
  await new Promise(resolve => child.once('close', resolve))
  const primary = new Error('hmr exited', { cause: new Error('compiler operation budget') })
  const diagnostics = new Error('incomplete status')
  await worker.finish({ failed: true, error: primary }, { failures: [diagnostics] }, { bytesWritten: 0 })
  expect(await fs.readFile(path.join(directory, 'worker-stdout.log'))).toEqual(Buffer.from([0, 255, 13, 10]))
  expect(await fs.readFile(path.join(directory, 'worker-stderr.log'), 'utf8')).toBe('first failure 中文\r\n')
  const result = JSON.parse(await fs.readFile(path.join(directory, 'worker-result.json')))
  expect(result).toMatchObject({ attached: true, closed: true, complete: true, processResult: { code: 2, signal: null }, firstFailure: { message: 'hmr exited', cause: { message: 'compiler operation budget' } }, diagnosticFailures: [{ message: 'incomplete status' }] })
  expect(result.streams.stdout.bytes).toBe(4)
  expect(result.streams.stderr.complete).toBe(true)
})

it('错误图保留AggregateError和cause，循环关系明确标注', () => {
  const first = new Error('first')
  const aggregate = new AggregateError([first, new TypeError('second')], 'both', { cause: first })
  first.cause = aggregate
  const result = describeFailure(aggregate)
  expect(result.cause.message).toBe('first')
  expect(result.cause.cause.reference).toBe(result.id)
  expect(result.errors[1]).toMatchObject({ name: 'TypeError', message: 'second' })
})

it('日志与操作共享会话总字节上限，超限不写出额外日志', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-output-limit-'))
  roots.push(directory)
  const worker = createWorkerEvidence(directory)
  await expect(worker.finish({ failed: false }, { failures: [] }, { bytesWritten: limits.maxTotalBytes })).rejects.toThrow('累计超过')
  expect(await fs.readdir(directory)).toEqual([])
})

it('单路日志超限写出失败回执与已取得原字节，不以截断日志放行', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-stream-limit-'))
  roots.push(directory)
  const worker = createWorkerEvidence(directory)
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() })
  worker.attach(child)
  child.stdout.emit('data', Buffer.from('prefix\r\n'))
  child.stdout.emit('data', Buffer.alloc(limits.maxProfileBytes))
  child.emit('close', 0, null)
  await expect(worker.finish({ failed: false }, { failures: [] })).rejects.toThrow('超过单文件')
  const result = JSON.parse(await fs.readFile(path.join(directory, 'worker-result.json')))
  expect(result.complete).toBe(false)
  expect(result.streams.stdout).toMatchObject({ bytes: 8, observedBytes: limits.maxProfileBytes + 8, complete: false })
  expect(result.diagnosticFailures[0].message).toContain('日志不完整')
  expect(await fs.readFile(path.join(directory, 'worker-stdout.log'), 'utf8')).toBe('prefix\r\n')
})
