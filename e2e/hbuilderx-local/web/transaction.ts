import { Buffer } from 'node:buffer'
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

interface Entry {
  file: string
  original: string
  allowed: string[]
}

/** 只恢复本轮拥有的字节；账本先于写入落盘，强制退出后仍可显式恢复。 */
export class SourceTransaction {
  private constructor(readonly journal: string, readonly root: string, private entries: Entry[]) {}

  static async create(journal: string, root: string, files: string[]) {
    const canonicalRoot = await realpath(root)
    const entries: Entry[] = []
    for (const file of new Set(files)) {
      const canonical = await realpath(file)
      const relative = path.relative(canonicalRoot, canonical)
      if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
        throw new Error(`验收文件超出项目：${file}`)
      }
      const original = (await readFile(canonical)).toString('base64')
      entries.push({ file: canonical, original, allowed: [original] })
    }
    await mkdir(path.dirname(journal), { recursive: true })
    const transaction = new SourceTransaction(journal, canonicalRoot, entries)
    await writeFile(journal, JSON.stringify({ root: canonicalRoot, entries }, null, 2), { flag: 'wx' })
    return transaction
  }

  static async recover(journal: string, root: string) {
    const data = JSON.parse(await readFile(journal, 'utf8'))
    const canonicalRoot = await realpath(root)
    if (data.root !== canonicalRoot || !Array.isArray(data.entries)) {
      throw new Error('恢复账本不属于当前项目')
    }
    for (const entry of data.entries) {
      const canonical = await realpath(entry.file)
      const relative = path.relative(canonicalRoot, canonical)
      if (canonical !== entry.file || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
        || typeof entry.original !== 'string' || !Array.isArray(entry.allowed) || !entry.allowed.every((value: unknown) => typeof value === 'string')) {
        throw new Error('恢复账本包含无效文件')
      }
    }
    return new SourceTransaction(journal, canonicalRoot, data.entries)
  }

  private async persist() {
    const temporary = `${this.journal}.next`
    await writeFile(temporary, JSON.stringify({ root: this.root, entries: this.entries }, null, 2))
    await rename(temporary, this.journal)
  }

  async assertOwned() {
    for (const entry of this.entries) {
      if (await realpath(entry.file) !== entry.file || !entry.allowed.includes((await readFile(entry.file)).toString('base64'))) {
        throw new Error(`检测到外部修改，停止覆盖并保留恢复账本：${entry.file}`)
      }
    }
  }

  async expectGenerated(file: string, content: string) {
    await this.assertOwned()
    const entry = this.entries.find(entry => entry.file === path.resolve(file))
    if (!entry) {
      throw new Error(`文件未登记：${file}`)
    }
    // 编译器异步生成期间允许上一版本及已经声明的下一版本。
    const current = (await readFile(file)).toString('base64')
    entry.allowed = [current, Buffer.from(content).toString('base64')]
    await this.persist()
  }

  async write(file: string, content: string) {
    await this.expectGenerated(file, content)
    await writeFile(file, content, 'utf8')
  }

  async restore() {
    await this.assertOwned()
    for (const entry of this.entries) {
      entry.allowed.push(entry.original)
    }
    await this.persist()
    for (const entry of this.entries) {
      await this.assertOwned()
      await writeFile(entry.file, Buffer.from(entry.original, 'base64'))
    }
    await rm(this.journal)
  }
}
