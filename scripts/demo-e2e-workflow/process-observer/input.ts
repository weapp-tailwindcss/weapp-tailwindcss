import { Buffer } from 'node:buffer'

/** 已读行只关联完全相同的在途原始 JSON，不借用相同 ID 或模糊字节前缀。 */
export function observerInputRequest<T extends { line: string }>(message: { pid?: unknown, line?: unknown }, pid: number | undefined, pending: ReadonlyMap<number, T>) {
  if (message.pid !== pid || !Number.isInteger(message.pid) || typeof message.line !== 'string') {
    throw new Error('身份采集器已读行缺少本体 PID 或原始请求。')
  }
  const bytes = Buffer.from(message.line, 'base64')
  if (!bytes.length || bytes.toString('base64') !== message.line) {
    throw new Error('身份采集器已读行不是完整的 Base64 请求。')
  }
  const line = bytes.toString('utf8')
  const id = JSON.parse(line)?.id
  const request = pending.get(id)
  if (!Number.isInteger(id) || !request || request.line !== line) {
    throw new Error('身份采集器已读行不属于本轮在途请求。')
  }
  return request
}
