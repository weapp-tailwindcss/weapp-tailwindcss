import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { expect, it } from 'vitest'
import { repo } from './catalog.mjs'

it('记录真实 watcher 的关闭调用且不延迟自然退出', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'watch-lifecycle-'))
  try {
    const result = await execa(process.execPath, [
      '--require',
      path.join(repo, 'scripts/ci/demo-matrix/watch-lifecycle-diagnostic.cjs'),
      '-e',
      'const fs = require("node:fs"); const watcher = fs.watch(process.argv[1]); watcher.close()',
      directory,
    ], { cwd: directory, timeout: 5000 })
    const report = JSON.parse(result.stderr.trim().slice('[watch-lifecycle] '.length))
    expect(report.code).toBe(0)
    expect(report.active).toEqual([])
    expect(report.recent.map(item => item.event)).toEqual(['fs.watch', 'fs.close', 'fs.closed'])
    expect(report.recent.find(item => item.event === 'fs.close').stack).toContain('[eval]')
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})
