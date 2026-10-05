import fs from 'node:fs'
import path from 'node:path'

/** 文件监听绑定父目录，避免编辑器原子替换文件后仍监听已移除的 inode。 */
export function watchInput(target: string, changed: () => void) {
  const recursive = fs.statSync(target).isDirectory()
  const watchRoot = recursive ? target : path.dirname(target)
  return fs.watch(watchRoot, { persistent: false, recursive }, (_event, filename) => {
    if (recursive || filename === null || path.resolve(watchRoot, filename) === target) {
      changed()
    }
  })
}
