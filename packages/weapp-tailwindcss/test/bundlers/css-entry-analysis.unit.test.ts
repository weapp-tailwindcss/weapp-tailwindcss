import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { postcss } from '@weapp-tailwindcss/postcss'
import { describe, expect, it, vi } from 'vitest'
import { resolveTailwindV4EntriesFromCssCached } from '@/bundlers/shared/source-scan/css-entries'

describe('CSS 入口扫描分析', () => {
  it('首次扫描复用解析结果，配置改变后重新求值', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-css-entry-analysis-'))
    const parse = vi.spyOn(postcss, 'parse')
    try {
      const config = path.join(root, 'tailwind.config.js')
      await writeFile(config, 'module.exports = { content: ["./pages/**/*.wxml"] }')
      const css = '@config "./tailwind.config.js"; @import "tailwindcss";'
      const first = await resolveTailwindV4EntriesFromCssCached(css, root)
      expect(first?.entries.some(entry => entry.pattern.includes('pages'))).toBe(true)
      expect(parse.mock.calls.filter(([source]) => source === css)).toHaveLength(1)
      expect(await resolveTailwindV4EntriesFromCssCached(css, root)).toBe(first)

      await writeFile(config, 'module.exports = { content: ["./components/**/*.wxml"] }')
      const next = await resolveTailwindV4EntriesFromCssCached(css, root)
      expect(next).not.toBe(first)
      expect(next?.entries.some(entry => entry.pattern.includes('components'))).toBe(true)
      expect(next?.entries.some(entry => entry.pattern.includes('pages'))).toBe(false)
    }
    finally {
      parse.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  })
})
