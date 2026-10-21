import type { Server } from 'node:http'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { formatWorkflowError, runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { NATIVE_CAPTURE_DRAIN_TIMEOUT } from './capture-budget'

/** 收尾单独计时，不能延长采集判定预算；迟到拒绝保留在 Promise 处理链中。 */
export async function awaitCaptureCleanup(operation: Promise<unknown>, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} cleanup exceeded ${NATIVE_CAPTURE_DRAIN_TIMEOUT}ms`)), NATIVE_CAPTURE_DRAIN_TIMEOUT)
    })])
  }
  finally { clearTimeout(timer) }
}

/** 仅关闭本轮 reporter 的连接，挂起客户端不能无限阻塞 server.close。 */
export async function closeCaptureReporter(server: Server) {
  if (!server.listening) {
    return
  }
  const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  server.closeIdleConnections()
  try {
    await awaitCaptureCleanup(closed, 'Native reporter')
  }
  catch (error) {
    server.closeAllConnections()
    throw error
  }
}

/** provider 停止后再次确认真实操作终态；在途证据不能复制或删除，迟到错误也不能抹去。 */
export async function publishAfterCapture(session: { directory: string, publish: () => Promise<void> }, owner: { drain: () => Promise<void>, capturePending: () => boolean }, restore: () => Promise<void> = async () => {}) {
  let failure: unknown
  await runWithCleanup(async () => {
    try {
      await owner.drain()
    }
    catch (error) {
      failure = error
      throw error
    }
  }, async () => {
    const pending = owner.capturePending()
    let restoreFailure: unknown
    await runWithCleanup(async () => {
      if (pending) {
        throw new Error(`截图仍在途，保留原始证据目录：${session.directory}`)
      }
      try {
        await restore()
      }
      catch (error) {
        restoreFailure = error
        throw error
      }
    }, async () => {
      await writeFile(path.join(session.directory, 'capture-cleanup.json'), `${JSON.stringify({
        version: 1,
        pending,
        status: failure || restoreFailure ? 'failed' : 'settled',
        ...(failure ? { error: formatWorkflowError(failure) } : {}),
        ...(restoreFailure ? { restoreError: formatWorkflowError(restoreFailure) } : {}),
      }, null, 2)}\n`)
      if (!pending) {
        await session.publish()
      }
    })
  })
}
