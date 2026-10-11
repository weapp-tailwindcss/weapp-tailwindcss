import type { ExpectStatic } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'vitest'

interface Entry { base: string, pattern: string, negated: boolean }

/** 对真实文件集合使用相同预期，避免各入口分别复制扫描断言。 */
export function sourceFilesContract(name: string, enumerate: (entries: Entry[]) => Promise<string[]>, expect: ExpectStatic) {
  describe(`${name} 文件集合契约`, () => {
    it('多根、绝对 glob、排除与文件重建使用同一集合语义', async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scan-files-'))
      try {
        const first = path.join(root, '中文 pages')
        const second = path.join(root, 'other')
        await fs.mkdir(first)
        await fs.mkdir(second)
        const kept = path.join(first, 'page.qxml')
        const removed = path.join(second, 'private.qxml')
        await fs.writeFile(kept, 'flex')
        await fs.writeFile(removed, 'grid')
        const entries: Entry[] = [
          { base: first, pattern: '**/*.qxml', negated: false },
          { base: root, pattern: path.join(second, '**', '*.qxml'), negated: false },
          { base: second, pattern: 'private.qxml', negated: true },
        ]
        const canonicalRoot = await fs.realpath(root)
        const relativeFiles = async () => (await enumerate(entries)).map(file => path.relative(canonicalRoot, file)).sort()
        expect(await relativeFiles()).toEqual([path.join('中文 pages', 'page.qxml')])
        await fs.rm(kept)
        expect(await relativeFiles()).toEqual([])
        await fs.writeFile(kept, 'underline')
        expect(await relativeFiles()).toEqual([path.join('中文 pages', 'page.qxml')])
      }
      finally {
        await fs.rm(root, { recursive: true, force: true })
      }
    })
  })
}
