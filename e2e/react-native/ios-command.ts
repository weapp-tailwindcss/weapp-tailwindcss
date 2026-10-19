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
export function iosAppWasNotRunning(error: unknown, bundleId: string): error is IosCommandError {
  if (!(error instanceof IosCommandError) || error.exitCode !== 3) {
    return false
  }
  const header = 'An error was encountered processing the command (domain=NSPOSIXErrorDomain, code=3):'
  const lines = error.stderr.trim().split(/\r?\n/).map(line => line.trim())
  if (lines[0] !== header) {
    return false
  }
  if (lines[1] === 'Application termination failed.' && lines.includes('No such process')) {
    return true
  }
  // 新版 simctl 对首次安装、尚未启动的目标报告另一种 ESRCH；同时绑定应用身份。
  const nothingToTerminate = [
    header,
    `Simulator device failed to terminate ${bundleId}.`,
    'found nothing to terminate',
    'Underlying error (domain=NSPOSIXErrorDomain, code=3):',
    `The request to terminate "${bundleId}" failed. found nothing to terminate`,
    'found nothing to terminate',
  ]
  return lines.length === nothingToTerminate.length && lines.every((line, index) => line === nothingToTerminate[index])
}
