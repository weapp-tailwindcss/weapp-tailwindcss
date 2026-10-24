import { execFile } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, it } from 'vitest'

describe('关闭插件的宿主引用释放', () => {
  it('成功和失败关闭均释放上下文与任务结果，并保持插件可观察的幂等终态', async ({ signal }) => {
    try {
      await promisify(execFile)(process.execPath, [
        '--expose-gc',
        '--import',
        import.meta.resolve('tsx'),
        fileURLToPath(new URL('./fixtures/plugin-shutdown-retention.mjs', import.meta.url)),
      ], {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        timeout: 20_000,
        signal,
      })
    }
    catch (error) {
      const output = error as Error & { stdout?: string, stderr?: string }
      throw new Error(`插件关闭引用释放子进程失败。\n${output.stdout ?? ''}${output.stderr ?? ''}`, { cause: error })
    }
  }, 25_000)
})
