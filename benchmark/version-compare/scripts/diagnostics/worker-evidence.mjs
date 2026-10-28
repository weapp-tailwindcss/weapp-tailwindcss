import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { limits } from './constants.mjs'
import { isOperationEvidenceFilename, sha256 } from './evidence.mjs'
import { describeFailure } from './failures.mjs'

/** 控制器归档原始两路字节；超限明确失败，不能把不完整日志当作完整证据。 */
export function createWorkerEvidence(directory) {
  const streams = { stdout: { chunks: [], observedBytes: 0, retainedBytes: 0 }, stderr: { chunks: [], observedBytes: 0, retainedBytes: 0 } }
  let attached = false
  let closed = false
  let processResult
  let outputError
  let firstFailure
  function collect(name, value) {
    const stream = streams[name]
    const chunk = Buffer.from(value)
    stream.observedBytes += chunk.length
    if (outputError) return
    if (stream.retainedBytes + chunk.length > limits.maxProfileBytes) {
      outputError = new Error(`worker ${name} 超过单文件固定上限；日志不完整，诊断失败`)
      return
    }
    stream.chunks.push(chunk)
    stream.retainedBytes += chunk.length
  }
  return {
    attach(child) {
      if (attached) throw new Error('worker 日志重复绑定')
      attached = true
      child.stdout.on('data', chunk => collect('stdout', chunk))
      child.stderr.on('data', chunk => collect('stderr', chunk))
      child.once('error', error => { firstFailure ??= { error } })
      child.once('close', (code, signal) => { closed = true; processResult = { code, signal } })
    },
    async finish(execution, diagnostics, accounting = {}) {
      if (execution.failed) firstFailure ??= { error: execution.error }
      const failures = [...(diagnostics.failures ?? []), ...(outputError ? [outputError] : [])]
      const receipts = {}
      const operationFiles = (await fs.readdir(directory)).filter(isOperationEvidenceFilename)
      const actualOperationBytes = (await Promise.all(operationFiles.map(file => fs.stat(path.join(directory, file)).then(stat => stat.size)))).reduce((total, size) => total + size, 0)
      const operationBytes = Math.max(actualOperationBytes, accounting.bytesWritten ?? 0)
      for (const [name, stream] of Object.entries(streams)) {
        const raw = Buffer.concat(stream.chunks)
        const file = `worker-${name}.log`
        receipts[name] = { file, bytes: raw.length, sha256: sha256(raw), observedBytes: stream.observedBytes, complete: stream.observedBytes === stream.retainedBytes }
      }
      const report = {
        attached, closed, processResult, streams: receipts,
        firstFailure: firstFailure && describeFailure(firstFailure.error),
        diagnosticFailures: failures.map(error => describeFailure(error)),
        operationAccounting: { actualBytes: actualOperationBytes, statusBytes: accounting.bytesWritten, consistent: actualOperationBytes === accounting.bytesWritten },
        complete: attached && closed && !outputError,
      }
      const payload = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
      const bytes = Object.values(receipts).reduce((total, receipt) => total + receipt.bytes, payload.length)
      if (payload.length > limits.maxProfileBytes || bytes + operationBytes > limits.maxTotalBytes) {
        throw new Error('worker 日志、错误回执与操作证据累计超过固定字节上限')
      }
      for (const [name, stream] of Object.entries(streams)) await fs.writeFile(path.join(directory, receipts[name].file), Buffer.concat(stream.chunks))
      await fs.writeFile(path.join(directory, 'worker-result.json'), payload)
      if (outputError) throw outputError
      if (attached && !closed) throw new Error('worker 日志尚未关闭；不声明日志完整')
    },
  }
}
