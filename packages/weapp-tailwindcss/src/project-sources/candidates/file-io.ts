import { readFile } from 'node:fs/promises'

const SOURCE_FILE_CONCURRENCY = 8
let activeReads = 0
let pendingOffset = 0
const pendingReads: Array<() => void> = []

/** 各扫描器共享读取预算，避免多个入口同时耗尽进程的文件描述符。 */
export async function readSourceCandidateFile(file: string) {
  if (activeReads >= SOURCE_FILE_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      pendingReads.push(resolve)
    })
  }
  else {
    activeReads++
  }
  try {
    return await readFile(file, 'utf8')
  }
  finally {
    if (pendingOffset < pendingReads.length) {
      const next = pendingReads[pendingOffset++]!
      if (pendingOffset === pendingReads.length) {
        pendingReads.length = 0
        pendingOffset = 0
      }
      next()
    }
    else {
      activeReads--
    }
  }
}

/** 有限并发处理全部文件；失败时先等待在途操作结束，再原样传播错误。 */
export async function forEachSourceCandidateFile<T>(files: Iterable<T>, handle: (file: T) => Promise<unknown>) {
  const iterator = files[Symbol.iterator]()
  let failed = false
  let failure: unknown
  async function worker() {
    while (!failed) {
      const next = iterator.next()
      if (next.done) {
        return
      }
      try {
        await handle(next.value)
      }
      catch (error) {
        if (!failed) {
          failed = true
          failure = error
        }
      }
    }
  }
  await Promise.all(Array.from({ length: SOURCE_FILE_CONCURRENCY }, worker))
  if (failed) {
    throw failure
  }
}
