import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { expect, it, vi } from 'vitest'
import { repo } from './catalog.mjs'
import { start } from './process.mjs'

it('通过文件 URL 在子目录启动的进程中记录退出并保留 Node 参数', async () => {
  vi.stubEnv('DEMO_MATRIX_PROCESS_DIAGNOSTICS', '1')
  const session = start(['exec', 'node', '-e', 'console.log(process.env.NODE_OPTIONS)'], path.join(repo, 'demo', 'mpx-tailwindcss-v4'), { NODE_OPTIONS: '--stack-trace-limit=30' })
  try {
    const result = await session.done
    expect(result.exitCode).toBe(0)
    expect(session.log()).toContain('--stack-trace-limit=30')
    expect(session.log()).toContain('--import=file:')
    expect(session.log()).toContain('"event":"beforeExit"')
    expect(() => session.ensureRunning()).toThrow()
  }
  finally {
    await session.stop()
    vi.unstubAllEnvs()
  }
})

it.each([
  { source: 'Promise.resolve()', code: 0, events: ['start', 'beforeExit', 'exit'] },
  { source: 'process.exit(7)', code: 7, events: ['start', 'exit'] },
  { source: 'throw new Error("diagnostic-probe")', code: 1, events: ['start', 'uncaughtException', 'exit'] },
])('records process lifecycle without masking exit $code', async ({ source, code, events }) => {
  const result = await execa(process.execPath, [
    '--require',
    path.join(repo, 'scripts/ci/demo-matrix/process-diagnostic.cjs'),
    '-e',
    source,
  ], { reject: false, timeout: 5000 })
  expect(result.exitCode).toBe(code)
  const records = result.stderr.split('\n').filter(line => line.startsWith('[demo-process] ')).map(line => JSON.parse(line.slice('[demo-process] '.length)))
  expect(records.map(record => record.event)).toEqual(events)
  expect(records.at(-1).code).toBe(code)
  expect(records.every(record => record.pid > 0 && Array.isArray(record.resources))).toBe(true)
  if (code === 1) {
    expect(records.find(record => record.event === 'uncaughtException').error).toContain('diagnostic-probe')
  }
})
