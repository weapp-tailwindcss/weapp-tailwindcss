import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { captureNativeHost } from './host'

export interface NativeProcessSampleResult {
  status: string
  stdout?: string
  stderr?: string
  exitCode?: number | undefined
  timedOut?: boolean
  file?: string
  host?: Awaited<ReturnType<typeof captureNativeHost>> | undefined
}

export async function sampleNativeProcess(pid: number, cancelSignal: AbortSignal, file: string, executable = { file: 'sample', args: [] as string[] }): Promise<NativeProcessSampleResult> {
  // 只采样本轮原命令的 PID，不另发 simctl 查询或干预共享服务。
  const sampling = execa(executable.file, [...executable.args, String(pid), '2', '10', '-file', file], {
    cancelSignal,
    timeout: 5000,
    killSignal: 'SIGKILL',
    maxBuffer: 256 * 1024,
    reject: false,
  })
  // 与 sample 并行且共用取消信号；sample 无输出时仍保留主机和进程状态。
  const [result, host] = await Promise.all([
    sampling,
    process.platform === 'darwin' ? captureNativeHost(pid, cancelSignal) : undefined,
  ])
  return {
    status: result.isCanceled ? 'canceled' : result.failed ? 'failed' : 'complete',
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    file: path.basename(file),
    host,
  }
}
