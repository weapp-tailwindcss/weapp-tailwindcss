import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '..')
const vitest = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs')

it.each([false, true])('生命周期测试继承父取消标记（存在=%s）后完整执行，不写入或清理父标记', async (exists) => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'watch-fixture-isolation-'))
  const parent = path.join(temporary, 'parent-control')
  const cancel = path.join(parent, 'cancel')
  const report = path.join(temporary, 'vitest.json')
  await mkdir(parent)
  const original = 'parent cancellation\r\n父流程证据'
  if (exists) {
    await writeFile(cancel, original)
  }
  const before = exists ? await stat(cancel) : undefined
  try {
    const result = await execa(process.execPath, [vitest, 'run', '-c', 'e2e/vitest.e2e.config.ts', 'e2e/watch-command-lifecycle.test.ts', '--update=none', '--reporter=json', '--outputFile', report], {
      cwd: root,
      env: { ...process.env, CI: '1', E2E_WATCH_CANCEL_FILE: cancel },
      reject: false,
      timeout: 10_000,
      forceKillAfterDelay: 1000,
    })
    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
    const summary = JSON.parse(await readFile(report, 'utf8'))
    expect(summary.numFailedTests).toBe(0)
    expect(summary.numPendingTests).toBe(0)
    expect(summary.numTotalTests).toBeGreaterThan(0)
    expect(summary.numPassedTests).toBe(summary.numTotalTests)
    expect((await stat(parent)).isDirectory()).toBe(true)
    if (exists) {
      expect(await readFile(cancel, 'utf8')).toBe(original)
      expect((await stat(cancel)).ino).toBe(before!.ino)
    }
    else {
      await expect(stat(cancel)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  }
  finally {
    await rm(temporary, { recursive: true, force: true })
  }
}, 15_000)
