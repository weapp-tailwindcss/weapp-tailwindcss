import process from 'node:process'
import { execa } from 'execa'
import { createPnpmCommand } from './pnpm-command.mjs'

/** 切换工作目录时保留子进程环境实际选定的 pnpm 入口和参数。 */
export function execaPnpm(args, options = {}) {
  const environment = options.extendEnv === false
    ? options.env ?? {}
    : { ...process.env, ...options.env }
  const invocation = createPnpmCommand(args, { npmExecPath: environment.npm_execpath })
  // Execa 自行处理 Windows cmd 包装和参数转义；shell: true 会将参数直接拼接并丢失边界。
  return execa(invocation.command, invocation.args, { ...options, shell: false })
}
