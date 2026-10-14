import type { HBuilderXCommandOptions } from '../../../packages/hbuilderx-runner/src/types'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { spawnCommand } from '../../../packages/hbuilderx-runner/src/process'
import { runWithCleanup } from '../../../scripts/e2e-preflight/cleanup'

/** 从包声明解析 CLI，避免依赖 pnpm 的安装目录结构或未导出的子路径。 */
export async function resolveWranglerCommand(websiteRoot: string, port: number): Promise<HBuilderXCommandOptions> {
  const require = createRequire(pathToFileURL(path.join(websiteRoot, 'package.json')))
  const manifestFile = require.resolve('wrangler/package.json')
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as { bin?: Record<string, string> }
  const bin = manifest.bin?.wrangler
  if (!bin) {
    throw new Error(`Wrangler 缺少 bin.wrangler：${manifestFile}`)
  }
  return {
    command: process.execPath,
    args: [path.resolve(path.dirname(manifestFile), bin), 'dev', '--config', path.join(websiteRoot, 'wrangler.jsonc'), '--env', '', '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0'],
    cwd: websiteRoot,
    env: { CI: '1', WRANGLER_SEND_METRICS: 'false' },
  }
}

/** 取消、超时和失败均等待本轮命令退出；清理失败与主错误一起保留。 */
export async function runLocalCommand(options: HBuilderXCommandOptions, signal: AbortSignal, timeoutMs = 30 * 60_000) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('本地命令预算已耗尽，禁止启动。')
  }
  signal.throwIfAborted()
  const command = spawnCommand(options)
  let timer: NodeJS.Timeout | undefined
  let abort!: () => void
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => reject(new Error(`本地命令超时 ${timeoutMs}ms：${options.command} ${options.args.join(' ')}`)), timeoutMs)
  })
  try {
    return await runWithCleanup(async () => {
      if (signal.aborted) {
        abort()
      }
      const exit = await Promise.race([command.closed, interrupted])
      signal.throwIfAborted()
      if (exit.code !== 0) {
        throw new Error(`本地命令失败：${options.command} ${options.args.join(' ')}\ncwd=${options.cwd}\nexit=${exit.code} signal=${exit.signal}\n${command.logs.join('')}`)
      }
    }, () => command.stop())
  }
  finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}
