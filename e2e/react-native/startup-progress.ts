import type { RuntimeSessionIdentity } from './runtime-artifacts'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

/** 阶段原件留在本轮独立目录；跨截止时间的完成记录不能成为已接受进度。 */
export function createNativeStartupProgress(directory: string, identity: RuntimeSessionIdentity) {
  let sequence = 0
  return async (stage: string, status: 'started' | 'completed' | 'failed', detail: { deadline: number, signal: AbortSignal, error?: unknown }) => {
    const check = () => {
      if (status === 'failed') {
        return
      }
      detail.signal.throwIfAborted()
      if (Date.now() >= detail.deadline) {
        throw new Error(`Native startup stage ${stage} exceeded its absolute deadline`)
      }
    }
    check()
    const event = { ...identity, sequence: ++sequence, stage, status, at: new Date().toISOString(), deadline: detail.deadline, ...('error' in detail ? { error: String(detail.error) } : {}) }
    const progress = path.join(directory, 'startup-progress')
    const target = path.join(progress, `${String(sequence).padStart(6, '0')}-${status}.json`)
    const temporary = `${target}.tmp`
    let accepted = false
    let renamed = false
    try {
      await fs.mkdir(progress, { recursive: true })
      check()
      await fs.writeFile(temporary, `${JSON.stringify(event, null, 2)}\n`, { flag: 'wx', ...(status === 'failed' ? {} : { signal: detail.signal }) })
      check()
      await fs.rename(temporary, target)
      renamed = true
      check()
      accepted = true
      process.stdout.write(`[react-native-startup] ${JSON.stringify(event)}\n`)
    }
    finally {
      if (!accepted) {
        await fs.rm(renamed ? target : temporary, { force: true })
      }
    }
  }
}
