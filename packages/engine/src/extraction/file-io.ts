import { promises as fs } from 'node:fs'

const CANDIDATE_FILE_CONCURRENCY = 8
let activeReads = 0
let pendingOffset = 0
const pendingReads: Array<() => void> = []

/** 原始补扫、任意值补扫与位置报告共享读取预算，避免多生成请求耗尽文件描述符。 */
export async function readCandidateFile(file: string) {
  if (activeReads >= CANDIDATE_FILE_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      pendingReads.push(resolve)
    })
  }
  else {
    activeReads++
  }
  try {
    return await fs.readFile(file, 'utf8')
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

/** 分批遍历避免为全部文件同时分配 Promise，输出沿用文件枚举顺序。 */
export async function mapCandidateFiles<T>(files: string[], handle: (file: string) => Promise<T>) {
  const results: T[] = []
  for (let start = 0; start < files.length; start += CANDIDATE_FILE_CONCURRENCY) {
    results.push(...await Promise.all(files.slice(start, start + CANDIDATE_FILE_CONCURRENCY).map(handle)))
  }
  return results
}
