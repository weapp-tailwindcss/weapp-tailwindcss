import fs from 'node:fs/promises'
import { fromLogical } from './files.mjs'

/** gitlink 只保留父仓库的引用身份，产品中不能初始化或加入其内容。 */
export async function assertEmptyGitlinks(root, gitlinks) {
  if (!Array.isArray(gitlinks)) {
    throw new TypeError('来源缺 gitlink 清单')
  }
  const seen = new Set()
  for (const entry of gitlinks) {
    if (entry.mode !== '160000' || !/^[a-f0-9]{40}$/.test(entry.gitCommit ?? '') || seen.has(entry.logical)) {
      throw new Error('gitlink 身份不完整或重复')
    }
    seen.add(entry.logical)
    const directory = fromLogical(root, entry.logical)
    const stat = await fs.lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(directory) !== directory || (await fs.readdir(directory)).length !== 0) {
      throw new Error(`gitlink 必须保留为所属产品中的空目录：${entry.logical}`)
    }
  }
}
