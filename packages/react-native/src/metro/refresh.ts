import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { setTimeout } from 'node:timers/promises'

function fingerprint(files: string[]) {
  const hash = createHash('sha256')
  for (const file of files) {
    try {
      const stat = fs.statSync(file, { bigint: true })
      hash.update(JSON.stringify([file, String(stat.ino), String(stat.size), String(stat.mtimeNs), String(stat.ctimeNs)]))
      if (stat.isFile()) {
        hash.update(fs.readFileSync(file))
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      // 原子保存可能短暂移走原文件；缺失也是一个需要稳定验证的版本。
      hash.update(JSON.stringify([file, 'missing']))
    }
  }
  return hash.digest('hex')
}

/** 发布前验证显式输入的版本；watch 合并事件时也不能发布已过期的编译结果。 */
export async function compileStableInput<T>(files: string[], compile: () => Promise<T>, isCurrent: () => boolean): Promise<T | undefined> {
  for (let attempt = 0; attempt < 5 && isCurrent(); attempt++) {
    const before = fingerprint(files)
    if (files.length) {
      await setTimeout(25)
      if (!isCurrent()) {
        return undefined
      }
      if (before !== fingerprint(files)) {
        continue
      }
    }
    try {
      const result = await compile()
      if (!isCurrent()) {
        return undefined
      }
      if (before === fingerprint(files)) {
        return result
      }
    }
    catch (error) {
      if (!isCurrent()) {
        return undefined
      }
      if (before === fingerprint(files)) {
        throw error
      }
    }
  }
  if (isCurrent()) {
    throw new Error('React Native 样式输入持续变化，5 次稳定性检查后仍未完成保存；请完成保存后重试。')
  }
}

/** 等待期间出现新一轮刷新时，继续等待新一轮；过期轮的失败不能遮蔽新结果。 */
export async function waitForCurrentRefresh(entry: { ready: Promise<void> }) {
  for (;;) {
    const ready = entry.ready
    try {
      await ready
    }
    catch (error) {
      if (ready === entry.ready) {
        throw error
      }
    }
    if (ready === entry.ready) {
      return
    }
  }
}
