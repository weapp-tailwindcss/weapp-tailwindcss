import { execFile } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

describe('Gulp 关闭后的宿主引用释放', () => {
  it('保留真实插件、stream 和关闭结果时仍释放转换上下文，覆盖成功与清理失败', async ({ signal }) => {
    try {
      const { stdout } = await promisify(execFile)(process.execPath, [
        '--expose-gc',
        '--import',
        import.meta.resolve('tsx'),
        fileURLToPath(new URL('./fixtures/gulp-session-retention.mjs', import.meta.url)),
      ], {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        timeout: 20_000,
        signal,
      })
      expect(stdout.trim().split('\n')).toEqual([
        'PASS public Gulp successful close',
        'PASS public Gulp failed close',
        'PASS public shared-cache Gulp successful close',
        'PASS public shared-cache Gulp failed close',
        'PASS transform services successful close',
        'PASS transform services failed close',
      ])
    }
    catch (error) {
      const output = error as Error & { stdout?: string, stderr?: string }
      throw new Error(`Gulp 关闭引用释放子进程失败。\n${output.stdout ?? ''}${output.stderr ?? ''}`, { cause: error })
    }
  }, 25_000)
})
