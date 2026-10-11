import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** 使用公开复现仓库的 setup 脚本，保留相同模板与样式，并在失败后恢复源码。 */
export async function withIssue1144Setup<T>(projectRoot: string, action: () => Promise<T>) {
  const files = [
    { file: path.join(projectRoot, 'App.uvue'), fixture: 'App-setup.uts' },
    { file: path.join(projectRoot, 'pages', 'index', 'index.uvue'), fixture: 'index-setup.uts' },
  ]
  const sources = await Promise.all(files.map(async (item) => {
    const original = await readFile(item.file, 'utf8')
    const script = await readFile(path.resolve(__dirname, '../fixtures/issue-1144', item.fixture), 'utf8')
    const blocks = [...original.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)]
    if (blocks.length !== 1) {
      throw new Error(`Issue 1144 复现页必须恰有一个 script 块：${item.file}`)
    }
    return { ...item, original, setup: original.replace(blocks[0]![0], `<script setup lang="uts">\n${script}</script>`) }
  }))
  try {
    for (const item of sources) {
      await writeFile(item.file, item.setup)
    }
    return await action()
  }
  finally {
    for (const item of sources) {
      await writeFile(item.file, item.original)
    }
  }
}
