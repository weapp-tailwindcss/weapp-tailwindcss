import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { verifyViteTailSummary } from './vite-tail-observer.mjs'

/** 摘要必须与同一操作序列的实际事件一致，不能只凭 summary 宣称覆盖完整。 */
export async function verifyViteTailEvidence(directory, summary) {
  verifyViteTailSummary(summary)
  let previousMonotonicMs = -1
  for (const entry of summary.events) {
    const file = path.join(directory, `operation-${entry.sequence}.json`)
    const handle = await fs.open(file, 'r')
    let event
    try {
      const { size } = await handle.stat()
      if (size > 16 * 1024) {
        throw new Error('尾部阶段事件超过固定字节上限')
      }
      const buffer = Buffer.alloc(size + 1)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      if (bytesRead !== size) {
        throw new Error('尾部阶段事件读取期间发生变化')
      }
      event = JSON.parse(buffer.toString('utf8', 0, size))
    }
    finally {
      await handle.close()
    }
    const data = event.details
    if (event.sequence !== entry.sequence || event.name !== 'vite.tail.phase' || data?.phase !== entry.phase
      || !Number.isFinite(data.atEpochMs) || !Number.isFinite(data.atMonotonicMs) || data.atMonotonicMs < previousMonotonicMs
      || !['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'].every(name => Number.isFinite(data.memory?.[name]) && data.memory[name] >= 0)) {
      throw new Error(`尾部阶段事件与摘要不符：${entry.phase}`)
    }
    previousMonotonicMs = data.atMonotonicMs
  }
  return summary
}
