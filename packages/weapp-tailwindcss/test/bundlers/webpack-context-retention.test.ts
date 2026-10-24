import { execFile } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, it } from 'vitest'

describe('Webpack 关闭后的上下文引用释放', () => {
  it('保留 compiler、插件与关闭 Promise 时，旧 handler 和缓存产物可以回收', async ({ signal }) => {
    try {
      await promisify(execFile)(process.execPath, [
        '--expose-gc',
        '--import',
        import.meta.resolve('tsx'),
        fileURLToPath(new URL('./fixtures/webpack-context-retention.mjs', import.meta.url)),
      ], { cwd: fileURLToPath(new URL('../../', import.meta.url)), timeout: 25000, signal })
    }
    catch (error) {
      const output = error as Error & { stdout?: string, stderr?: string }
      throw new Error(`Webpack 上下文引用释放子进程失败。\n${output.stdout ?? ''}${output.stderr ?? ''}`, { cause: error })
    }
  }, 30000)
})
