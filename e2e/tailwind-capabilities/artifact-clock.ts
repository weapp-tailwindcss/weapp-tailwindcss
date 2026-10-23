import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** 用产物所在文件系统的时钟建立执行下界，避免与 Date 时钟的微小偏差误判新文件。 */
export function filesystemObservedAt(directory: string): string {
  fs.mkdirSync(directory, { recursive: true })
  const marker = path.join(directory, `.tailwind-clock-${randomUUID()}`)
  const descriptor = fs.openSync(marker, 'wx')
  const errors: unknown[] = []
  let observedAt: string | undefined
  try {
    observedAt = new Date(fs.fstatSync(descriptor).mtimeMs).toISOString()
  }
  catch (error) {
    errors.push(error)
  }
  for (const cleanup of [() => fs.closeSync(descriptor), () => fs.unlinkSync(marker)]) {
    try {
      cleanup()
    }
    catch (error) {
      errors.push(error)
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, `产物时钟采样或标记清理失败：${marker}`, { cause: errors[0] })
  }
  return observedAt!
}
