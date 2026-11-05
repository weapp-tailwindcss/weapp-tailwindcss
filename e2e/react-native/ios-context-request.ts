import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { awaitCaptureCleanup } from './capture-cleanup'

export interface IosCaptureIdentity {
  runId: string
  invocationId: string
  device: string
  bundleId: string
}

/** 认证 context 请求只表示本轮 JavaScript 已运行，不授予截图或像素通过。 */
export function createIosContextRequestPublisher(directory: string, identity: IosCaptureIdentity) {
  let work: Promise<void> | undefined
  let pending = false
  let cleanupDeadlineFailure: unknown
  let workFailure: unknown
  return {
    publish(signal: AbortSignal) {
      if (!work) {
        pending = true
        work = (async () => {
          signal.throwIfAborted()
          await fs.mkdir(directory, { recursive: true })
          const temporary = path.join(directory, 'context-requested.pending.json')
          const destination = path.join(directory, 'context-requested.json')
          let published = false
          let accepted = false
          await runWithCleanup(async () => {
            signal.throwIfAborted()
            await fs.writeFile(temporary, `${JSON.stringify({
              version: 1,
              evidence: 'diagnostic-only',
              kind: 'authenticated-context-request',
              ...identity,
              requestedAt: new Date().toISOString(),
            }, null, 2)}\n`, { signal, flag: 'wx' })
            signal.throwIfAborted()
            await fs.rename(temporary, destination)
            published = true
            signal.throwIfAborted()
            accepted = true
          }, () => runWithCleanup(
            () => fs.rm(temporary, { force: true }),
            async () => {
              if (published && !accepted) {
                await fs.rm(destination, { force: true })
              }
            },
          ))
        })().finally(() => {
          pending = false
        })
        // HTTP owner 和最终 drain 都保留同一失败；取消时不留下未处理拒绝。
        void work.catch((error) => {
          workFailure = error
        })
      }
      return work
    },
    pending: () => pending,
    async drain() {
      if (cleanupDeadlineFailure !== undefined) {
        if (workFailure !== undefined) {
          throw new AggregateError([cleanupDeadlineFailure, workFailure], 'iOS context request failed after exceeding its cleanup deadline', { cause: cleanupDeadlineFailure })
        }
        throw cleanupDeadlineFailure
      }
      try {
        await awaitCaptureCleanup(work ?? Promise.resolve(), 'iOS context request')
      }
      catch (error) {
        // 超时不等于实际写入已结束；后续收尾不能通过迟到完成抹去已违反的期限。
        if (pending) {
          cleanupDeadlineFailure = error
        }
        throw error
      }
    },
  }
}

/** CLI 在原启动 owner 下等待真实请求，只有尚未发布的事件允许轮询。 */
export async function awaitIosContextRequest(directory: string, identity: IosCaptureIdentity, signal: AbortSignal, checkDeadline: () => void) {
  while (true) {
    checkDeadline()
    let source: string
    try {
      source = await fs.readFile(path.join(directory, 'context-requested.json'), { encoding: 'utf8', signal })
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      await delay(100, undefined, { signal })
      continue
    }
    checkDeadline()
    const event = JSON.parse(source)
    if (event.version !== 1 || event.evidence !== 'diagnostic-only' || event.kind !== 'authenticated-context-request'
      || Object.entries(identity).some(([key, value]) => event[key] !== value)) {
      throw new Error('iOS capture context request has a mismatched runtime identity')
    }
    return
  }
}
