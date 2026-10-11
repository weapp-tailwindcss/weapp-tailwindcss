import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { expect, it } from 'vitest'
import { repo } from './catalog.mjs'

it.each(['initial', 'incremental'])('Mpx %s 致命编译错误必须输出原始错误并以非零状态结束', async (round) => {
  const result = await execa(process.execPath, [path.join(repo, 'scripts/ci/demo-matrix/fixtures/mpx-fatal-watch.cjs'), round], {
    reject: false,
    timeout: 10_000,
  })
  expect(result.timedOut).toBe(false)
  if (round === 'incremental') {
    expect(result.stdout).toContain('initial-ready')
  }
  expect(result.stderr).toContain('mpx-fatal-watch-regression')
  expect(result.exitCode).toBe(1)
})

it('Mpx 普通编译错误继续监听并允许下一轮恢复', async () => {
  const result = await execa(process.execPath, [path.join(repo, 'scripts/ci/demo-matrix/fixtures/mpx-fatal-watch.cjs'), 'recoverable'], {
    reject: false,
    timeout: 10_000,
  })
  expect(result.timedOut).toBe(false)
  expect(result.exitCode, result.stderr || result.stdout).toBe(0)
  expect(result.stdout).toContain('recoverable-error')
  expect(result.stdout).toContain('recovered')
  expect(result.exitCode).toBe(0)
})
