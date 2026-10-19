import { execa } from 'execa'

/** 保留进程退出状态与原始日志，避免把工具或设备故障当作应用未运行。 */
export class IosCommandError extends Error {
  constructor(readonly exitCode: number | undefined, readonly stdout: string, readonly stderr: string, message = 'iOS command') {
    super(`${message} exited with ${exitCode ?? 'unknown status'}\n${stdout}\n${stderr}`)
    this.name = 'IosCommandError'
  }
}

export async function executeIosCommand(file: string, args: string[], cwd: string, stream = false) {
  const result = await execa(file, args, { cwd, stdout: stream ? ['pipe', 'inherit'] : 'pipe', stderr: ['pipe', 'inherit'], stdin: 'ignore', timeout: 1_800_000, reject: false })
  if (result.failed) {
    throw new IosCommandError(result.exitCode, result.stdout ?? '', result.stderr ?? '', result.shortMessage)
  }
  return result.stdout ?? ''
}

/** simctl 的明确 ESRCH 才表示目标应用未运行；其它失败必须阻断。 */
export function iosAppWasNotRunning(error: unknown): error is IosCommandError {
  return error instanceof IosCommandError
    && error.exitCode === 3
    && /^An error was encountered processing the command \(domain=NSPOSIXErrorDomain, code=3\):\r?\nApplication termination failed\./.test(error.stderr)
    && /(?:^|\r?\n)[\t ]*No such process[\t ]*(?:\r?\n|$)/.test(error.stderr)
}
