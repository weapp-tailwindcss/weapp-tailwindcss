import { Buffer } from 'node:buffer'
import { closeSync, openSync, readSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function isNodeScript(file) {
  if (/\.(?:c|m)?js$/i.test(file)) {
    return true
  }
  let descriptor
  try {
    descriptor = openSync(file, 'r')
    const buffer = Buffer.alloc(256)
    const length = readSync(descriptor, buffer, 0, buffer.length, 0)
    return /^#![^\r\n]*\bnode(?:\s|$)/.test(buffer.toString('utf8', 0, length))
  }
  catch {
    return false
  }
  finally {
    if (descriptor !== undefined) {
      closeSync(descriptor)
    }
  }
}

export function createPnpmCommand(
  args,
  options = {},
) {
  const platform = options.platform ?? process.platform
  const execPath = options.execPath ?? process.execPath
  const npmExecPath = Object.hasOwn(options, 'npmExecPath')
    ? options.npmExecPath
    : process.env.npm_execpath

  const paths = platform === 'win32' ? path.win32 : path.posix
  const activeName = npmExecPath ? paths.basename(npmExecPath) : undefined
  if (activeName && /^pnpm(?:-native)?\.(?:cmd|bat|ps1)$/i.test(activeName)) {
    // 包装脚本需要 shell 重解释参数，不能静默换用 PATH 或猜测相邻 CLI。
    throw Object.assign(new Error(`无法保留 pnpm 包装入口身份：${npmExecPath}。请将 npm_execpath 指向 pnpm.mjs、pnpm.cjs 等 JavaScript 入口或 pnpm 原生可执行文件。`), {
      code: 'ERR_UNSUPPORTED_PNPM_ENTRY',
    })
  }
  const activeCli = activeName && /^(?:pnpm(?:-native)?(?:\.exe)?|pnpm\.(?:c|m)?js)$/i.test(activeName)
    ? paths.resolve(npmExecPath)
    : undefined
  if (activeCli) {
    const script = isNodeScript(activeCli)
    return {
      command: script ? execPath : activeCli,
      args: script ? [activeCli, ...args] : args,
      shell: false,
    }
  }

  return {
    command: platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args,
    shell: platform === 'win32',
  }
}
