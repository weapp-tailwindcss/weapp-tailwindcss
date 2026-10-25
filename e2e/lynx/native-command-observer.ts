import type { ChildProcess } from 'node:child_process'
import type { NativeProcessSampleResult } from '../native-command/sample'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { StringDecoder } from 'node:string_decoder'
import { sampleNativeProcess } from '../native-command/sample'

export { sampleNativeProcess } from '../native-command/sample'

const outputLimit = 16 * 1024

export interface CommandDiagnostics {
  file: string
}

interface ObserverOptions {
  sampleAfterMs?: number
  sampleProcess?: (pid: number, signal: AbortSignal) => Promise<NativeProcessSampleResult>
}

function capturedOutput() {
  let prefix = Buffer.alloc(0)
  let bytes = 0
  return {
    append(chunk: Buffer | string) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += buffer.length
      if (prefix.length < outputLimit) {
        prefix = Buffer.concat([prefix, buffer.subarray(0, outputLimit - prefix.length)])
      }
    },
    report() {
      return { text: new StringDecoder('utf8').write(prefix), bytes, truncated: bytes > outputLimit }
    },
  }
}

/** 观察同一次命令的生命周期；采样有界且随原进程退出取消，证据不包含环境变量。 */
export function observeNativeCommand(child: ChildProcess, file: string, options: ObserverOptions = {}) {
  const startedAt = new Date().toISOString()
  const start = performance.now()
  const events: Array<Record<string, unknown>> = []
  const stdout = capturedOutput()
  const stderr = capturedOutput()
  const controller = new AbortController()
  const record = (name: string, detail: Record<string, unknown> = {}) => events.push({ name, atMs: performance.now() - start, ...detail })
  let timer: ReturnType<typeof setTimeout> | undefined
  let sampling: Promise<NativeProcessSampleResult> | undefined
  let exited = false
  let spawned = false
  let firstStdout = true
  let firstStderr = true
  const stop = () => {
    exited = true
    clearTimeout(timer)
    controller.abort()
  }
  const onSpawn = () => {
    spawned = true
    record('spawn', { pid: child.pid })
  }
  const onError = (error: NodeJS.ErrnoException) => {
    record('error', { code: error.code, message: error.message })
    stop()
  }
  const onExit = (code: number | null, signal: string | null) => {
    record('exit', { code, signal })
    stop()
  }
  const onClose = (code: number | null, signal: string | null) => {
    record('close', { code, signal })
    stop()
  }
  const onStdout = (chunk: Buffer | string) => {
    if (firstStdout) {
      record('stdout')
      firstStdout = false
    }
    stdout.append(chunk)
  }
  const onStderr = (chunk: Buffer | string) => {
    if (firstStderr) {
      record('stderr')
      firstStderr = false
    }
    stderr.append(chunk)
  }
  child.on('spawn', onSpawn)
  child.on('error', onError)
  child.on('exit', onExit)
  child.on('close', onClose)
  child.stdout?.on('data', onStdout)
  child.stderr?.on('data', onStderr)
  timer = setTimeout(() => {
    if (!spawned || exited || child.exitCode !== null || child.signalCode !== null || !child.pid) {
      return
    }
    record('sample-start', { pid: child.pid })
    const sampleFile = path.join(path.dirname(file), `${path.parse(file).name}.sample.txt`)
    sampling = Promise.resolve().then(() => options.sampleProcess
      ? options.sampleProcess(child.pid!, controller.signal)
      : process.platform === 'darwin'
        ? sampleNativeProcess(child.pid!, controller.signal, sampleFile)
        : { status: 'unsupported-platform' }).catch((error: unknown) => ({
      status: 'failed',
      stderr: error instanceof Error ? error.message : String(error),
    })).then((result) => {
      record('sample-end', { status: result.status })
      return result
    })
  }, options.sampleAfterMs ?? 10_000)
  timer.unref()

  return async (outcome: 'success' | 'failure') => {
    record('settled', { outcome })
    stop()
    child.off('spawn', onSpawn)
    child.off('error', onError)
    child.off('exit', onExit)
    child.off('close', onClose)
    child.stdout?.off('data', onStdout)
    child.stderr?.off('data', onStderr)
    const sample = await sampling
    const report = { startedAt, durationMs: performance.now() - start, pid: child.pid, outcome, events, stdout: stdout.report(), stderr: stderr.report(), sample }
    await fs.writeFile(file, `${JSON.stringify(report, null, 2)}\n`)
  }
}
