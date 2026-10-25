import os from 'node:os'
import process from 'node:process'
import { execa } from 'execa'

/** 同步保存采样时刻的只读资源，宿主命令迟到或取消时仍有现场基线。 */
export function captureNativeHostResources() {
  return {
    at: new Date().toISOString(),
    loadAverage: os.loadavg(),
    freeMemory: os.freemem(),
    parallelism: os.availableParallelism(),
    parentCpu: process.cpuUsage(),
    parentResources: process.resourceUsage(),
  }
}

/** 慢命令诊断只读主机资源和进程状态，不读取参数、环境或干预模拟器服务。 */
export async function captureNativeHost(observedPid: number, cancelSignal: AbortSignal, executable = { file: 'ps', args: [] as string[] }) {
  const started = captureNativeHostResources()
  const start = performance.now()
  const processes = await execa(executable.file, [...executable.args, '-A', '-o', 'pid=,ppid=,state=,pcpu=,rss=,comm='], {
    cancelSignal,
    timeout: 5000,
    killSignal: 'SIGKILL',
    maxBuffer: 256 * 1024,
    reject: false,
  }).then(result => ({
    status: result.isCanceled ? 'canceled' : result.failed ? 'failed' : 'complete',
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
  }), (error: unknown) => ({
    status: 'failed',
    stdout: '',
    stderr: error instanceof Error ? error.message : String(error),
  }))
  return {
    observedPid,
    parentPid: process.pid,
    platform: process.platform,
    architecture: process.arch,
    release: os.release(),
    nodeVersion: process.version,
    totalMemory: os.totalmem(),
    ...started,
    completed: captureNativeHostResources(),
    durationMs: performance.now() - start,
    processes,
  }
}
