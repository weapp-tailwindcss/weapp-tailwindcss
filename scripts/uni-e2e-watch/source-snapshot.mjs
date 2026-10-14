import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const ignoredDirs = new Set(['dist', 'node_modules', '.git'])
const ignoredFiles = new Set(['auto-imports.d.ts', 'components.d.ts', 'uni-pages.d.ts'])
// 仅排除本仓库原子写入器拥有的临时文件，不忽略用户的隐藏源码。
const atomicTemporaryFile = /^\..+\.\d+\.[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.tmp$/i

async function collectFiles(dir, output) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  }
  catch (error) {
    if (error.code === 'ENOENT') {
      return
    }
    throw error
  }
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) {
      continue
    }
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(file, output)
    }
    else if (entry.isFile() && !ignoredFiles.has(entry.name) && !atomicTemporaryFile.test(entry.name)) {
      output.push(file)
    }
  }
}

export async function collectSourceSnapshot(cwd) {
  const files = []
  await collectFiles(path.resolve(cwd, 'src'), files)
  const snapshot = new Map()
  await Promise.all(files.map(async (file) => {
    try {
      const item = await stat(file)
      snapshot.set(file, `${item.mtimeMs}:${item.size}`)
    }
    catch (error) {
      // readdir 与 stat 之间删除的源码按缺失处理，不制造幽灵快照条目。
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }))
  return snapshot
}

export function hasSnapshotChanged(previous, next) {
  return previous.size !== next.size
    || [...next].some(([file, signature]) => previous.get(file) !== signature)
}
