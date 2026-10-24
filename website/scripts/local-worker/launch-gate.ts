import type { HBuilderXCommandOptions } from '../../../packages/hbuilderx-runner/src/types'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import preload from './launch-gate-path.cjs'

export const launchGateEnvironment = 'WEAPP_TAILWINDCSS_LOCAL_COMMAND_GATE'

/** NODE_OPTIONS 使用 Node 自身的引号语法，保留路径中的空白与控制字符。 */
export function prependNodePreload(preload: string, nodeOptions: string) {
  const quoted = `"${preload.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
  return `--require=${quoted} ${nodeOptions}`
}

/** 已知 Node CLI 在原进程中等待身份登记；不包装命令或改变 PID、参数与标准流。 */
export async function prepareLocalCommandGate(options: HBuilderXCommandOptions) {
  if (options.command !== process.execPath) {
    return undefined
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'website-command-gate-'))
  const nodeOptions = options.env?.NODE_OPTIONS ?? process.env.NODE_OPTIONS ?? '--max-old-space-size=8192'
  const deadline = Date.now() + 5000
  return {
    options: {
      ...options,
      env: {
        ...options.env,
        NODE_OPTIONS: prependNodePreload(preload, nodeOptions),
        [launchGateEnvironment]: JSON.stringify({ directory, nodeOptions, deadline }),
      },
    },
    release() {
      if (Date.now() >= deadline) {
        throw new Error('本地 Node 命令启动身份登记超过截止时间，禁止执行 CLI。')
      }
      // 创建目录是原子提交，子进程不会读取到半写入的放行凭据。
      mkdirSync(path.join(directory, 'released'))
    },
    async close() {
      await rm(directory, { recursive: true, force: true })
    },
  }
}

export type LocalCommandGate = Awaited<ReturnType<typeof prepareLocalCommandGate>>
