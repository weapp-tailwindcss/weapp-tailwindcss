import { constants } from 'node:fs'
import { access, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'

export function assertRuntimePath(file: string | undefined, label: string, platform = process.platform, allowCommand = false) {
  const api = platform === 'win32' ? path.win32 : path.posix
  if (file && !api.isAbsolute(file) && !(allowCommand && api.dirname(file) === '.' && !file.startsWith('.'))) {
    throw new Error(`${label} 必须使用绝对路径；原生构建工作目录与预检目录不同：${file}`)
  }
}

export function assertRuntimeSearchPath(file: string, env: NodeJS.ProcessEnv, platform = process.platform) {
  const api = platform === 'win32' ? path.win32 : path.posix
  if (!api.isAbsolute(file) && (env['PATH'] ?? env['Path'] ?? '').split(api.delimiter).some(dir => !api.isAbsolute(dir))) {
    throw new Error('原生工具 PATH 不能包含相对或空目录；请使用绝对 PATH 或指定工具绝对路径。')
  }
}

export function executableCandidates(file: string, env: NodeJS.ProcessEnv, cwd: string, platform = process.platform) {
  const api = platform === 'win32' ? path.win32 : path.posix
  const direct = api.isAbsolute(file) || api.dirname(file) !== '.'
  const dirs = direct ? [''] : (env['PATH'] ?? env['Path'] ?? '').split(api.delimiter)
  const extensions = platform === 'win32' && !api.extname(file) ? (env['PATHEXT'] ?? '.COM;.EXE;.BAT;.CMD').split(';') : ['']
  return dirs.flatMap(dir => extensions.map(ext => api.resolve(cwd, dir, `${file}${ext}`)))
}

export async function runtimeCommand(file: string, args: string[], cwd: string, env = process.env) {
  assertRuntimePath(file, '工具命令', process.platform, true)
  assertRuntimeSearchPath(file, env)
  let command: string | undefined
  for (const candidate of executableCandidates(file, env, cwd)) {
    const valid = await stat(candidate).then(item => item.isFile(), () => false)
    if (valid && await access(candidate, constants.X_OK).then(() => true, () => false)) {
      command = await realpath(candidate)
      break
    }
  }
  if (!command) {
    throw new Error(`原生工具不可执行：${file}；请配置对应工具路径后重新 prepare --extended。`)
  }
  const result = await execa(command, args, { cwd, env, all: true, timeout: 15_000, forceKillAfterDelay: 1000, windowsHide: true })
  return { command, output: (result.all ?? '').trim() }
}
