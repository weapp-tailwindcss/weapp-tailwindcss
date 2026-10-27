import { execFile } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

describe('closed compiler transform ownership', () => {
  it('releases cached trees after draining work without clearing another active compiler', async ({ signal }) => {
    try {
      const { stdout } = await promisify(execFile)(process.execPath, [
        '--expose-gc',
        '--import',
        import.meta.resolve('tsx'),
        fileURLToPath(new URL('./fixtures/core-transform-retention.mjs', import.meta.url)),
      ], {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        timeout: 20_000,
        signal,
      })
      expect(stdout.trim().split('\n')).toEqual([
        'PASS independent cached transforms',
        'PASS pending transform drain',
        'PASS failed root cleanup',
      ])
    }
    catch (error) {
      const output = error as Error & { stdout?: string, stderr?: string }
      throw new Error(`Core 转换释放子进程失败。\n${output.stdout ?? ''}${output.stderr ?? ''}`, { cause: error })
    }
  }, 25_000)
})
