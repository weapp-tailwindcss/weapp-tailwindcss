import { access } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { createPnpmCommand } from './pnpm-command.mjs'
import { pnpmEnvironment } from './pnpm-environment.mjs'

/** 切换工作目录时保留子进程环境实际选定的 pnpm 入口和参数。 */
export async function execaPnpm(args, options = {}) {
  const environment = pnpmEnvironment(process.env, options.env, options.extendEnv !== false)
  const invocation = createPnpmCommand(args, { npmExecPath: environment[process.platform === 'win32' ? 'NPM_EXECPATH' : 'npm_execpath'] })
  const paths = process.platform === 'win32' ? path.win32 : path.posix
  const entry = invocation.command === process.execPath
    ? invocation.args[0]
    : paths.isAbsolute(invocation.command) ? invocation.command : undefined
  if (entry) {
    // 显式入口缺失时直接保留文件系统错误，不让 Windows shell 改写成另一类退出错误。
    await access(entry)
  }
  // Execa 自行处理 Windows cmd 包装和参数转义；shell: true 会将参数直接拼接并丢失边界。
  return execa(invocation.command, invocation.args, { ...options, env: environment, extendEnv: false, shell: false })
}
