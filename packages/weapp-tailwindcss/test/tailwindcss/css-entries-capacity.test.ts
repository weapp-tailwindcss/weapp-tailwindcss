import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveTailwindV4EntriesFromCssCached } from '@/project-sources/css-entries'

describe('CSS 来源解析缓存容量', () => {
  it('不同 CSS revision 不会无限保留解析结果', async () => {
    const base = path.resolve(__dirname)
    const source = (index: number) => `@import "tailwindcss"; @source inline("p-${index}");`
    const first = await resolveTailwindV4EntriesFromCssCached(source(0), base)
    expect(first).toBeDefined()
    expect(await resolveTailwindV4EntriesFromCssCached(source(0), base)).toBe(first)
    for (let index = 1; index <= 128; index++) {
      await resolveTailwindV4EntriesFromCssCached(source(index), base)
    }
    const restored = await resolveTailwindV4EntriesFromCssCached(source(0), base)
    expect(restored).not.toBe(first)
    expect(restored).toEqual(first)
  })
})
