import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { captureMetroEvidence } from './metro-evidence'

interface DiagnosticSpan {
  name: string
  startedAtMs: number
  settledAtMs?: number
  error?: string
}

/** 输出由子进程 owner 直接落盘；取消后也等待文件流关闭，保留已经收到的部分日志。 */
export function captureNativeDiagnosticCommand(file: string, args: string[], options: { signal: AbortSignal, stdout: string, stderr: string }) {
  return execa(file, args, {
    cancelSignal: options.signal,
    forceKillAfterDelay: 1_000,
    reject: false,
    buffer: false,
    stdout: { file: options.stdout },
    stderr: { file: options.stderr },
  })
}

/** 所有失败诊断共用截止时间；等待真实取消完成后才把控制权交还会话收尾。 */
export async function withNativeFailureDiagnostics<T>(filename: string, action: (owner: {
  signal: AbortSignal
  step: <V>(name: string, operation: () => Promise<V>) => Promise<V>
}) => Promise<T>, timeoutMs = 30_000): Promise<T> {
  const owner = new AbortController()
  const started = performance.now()
  const spans: DiagnosticSpan[] = []
  let failure: unknown
  const timer = setTimeout(() => owner.abort(new Error(`Native failure diagnostics exceeded ${timeoutMs}ms`)), timeoutMs)
  const checkDeadline = () => {
    if (performance.now() - started >= timeoutMs && !owner.signal.aborted) {
      owner.abort(new Error(`Native failure diagnostics exceeded ${timeoutMs}ms`))
    }
    owner.signal.throwIfAborted()
  }
  return runWithCleanup(async () => {
    try {
      const result = await action({
        signal: owner.signal,
        async step(name, operation) {
          checkDeadline()
          const span: DiagnosticSpan = { name, startedAtMs: performance.now() - started }
          spans.push(span)
          try {
            const result = await operation()
            checkDeadline()
            return result
          }
          catch (error) {
            span.error = String(error)
            throw error
          }
          finally { span.settledAtMs = performance.now() - started }
        },
      })
      checkDeadline()
      return result
    }
    catch (error) {
      failure = error
      throw error
    }
  }, async () => {
    clearTimeout(timer)
    await fs.writeFile(filename, `${JSON.stringify({
      version: 1,
      evidence: 'diagnostic-only',
      timeoutMs,
      status: failure === undefined ? 'completed' : 'failed',
      elapsedMs: performance.now() - started,
      cancelled: owner.signal.aborted,
      ...(owner.signal.aborted ? { cancellation: String(owner.signal.reason) } : {}),
      ...(failure === undefined ? {} : { error: String(failure) }),
      spans,
    }, null, 2)}\n`)
  })
}

/** 诊断子进程和备用截图必须使用同一个 owner，不能在慢日志之后重置预算。 */
export async function captureFailureDiagnostics(options: {
  platform: 'ios' | 'android'
  device: string
  artifacts: string
  projectRoot: string
  inputs: Record<string, string>
  logcatSince?: string
  capture: (name: string, device: string, signal: AbortSignal) => Promise<string>
}) {
  const { platform, device, artifacts, projectRoot, inputs, logcatSince, capture } = options
  await withNativeFailureDiagnostics(path.join(artifacts, 'failure-diagnostics.json'), async (owner) => {
    await owner.step('metro-evidence', () => captureMetroEvidence(projectRoot, path.join(artifacts, 'metro-failure'), inputs, owner.signal))
      .catch(error => process.stderr.write(`Failed to preserve Metro compilation evidence: ${String(error)}\n`))
    const command = (file: string, args: string[], stdout: string, stderr: string) => captureNativeDiagnosticCommand(file, args, {
      signal: owner.signal,
      stdout: path.join(artifacts, stdout),
      stderr: path.join(artifacts, stderr),
    })
    if (platform === 'android') {
      await owner.step('device-log', () => command('adb', ['-s', device, 'logcat', '-d', '-v', 'threadtime', ...(logcatSince ? ['-T', logcatSince] : [])], 'logcat.txt', 'logcat.stderr.txt'))
      const dump = await owner.step('device-window-dump', () => command('adb', ['-s', device, 'shell', 'uiautomator', 'dump', '/sdcard/window.xml'], 'window-dump.txt', 'window-dump.stderr.txt'))
      if (dump.exitCode === 0) {
        await owner.step('device-window', () => command('adb', ['-s', device, 'exec-out', 'cat', '/sdcard/window.xml'], 'window-failure.xml', 'window-failure.stderr.txt'))
      }
    }
    else {
      await owner.step('device-log', () => command('xcrun', ['simctl', 'spawn', device, 'log', 'show', '--style', 'compact', '--last', '30m', '--predicate', 'process == "weapptailwindcssRN" OR subsystem BEGINSWITH "com.facebook.react" OR eventMessage CONTAINS "com.weapptailwindcss.rncompat"'], 'simulator.log', 'simulator.stderr.log'))
    }
    await owner.step('failure-screenshot', () => capture('failure.png', device, owner.signal))
  })
}
