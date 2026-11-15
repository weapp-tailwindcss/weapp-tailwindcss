import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const websiteRoot = fileURLToPath(new URL('..', import.meta.url))
const demoPath = path.resolve(websiteRoot, '../demo/uni-app-x-vdom-tailwindcss-v4')
const demoUrl = 'https://github.com/weapp-tailwindcss/weapp-tailwindcss/tree/main/demo/uni-app-x-vdom-tailwindcss-v4'
const docs = [
  ['中文', path.resolve(websiteRoot, 'docs/quick-start/frameworks/uni-app-x.mdx')],
  ['English', path.resolve(websiteRoot, 'i18n/en/docusaurus-plugin-content-docs/current/quick-start/frameworks/uni-app-x.mdx')],
] as const

describe('uni-app x 示例文档链接', () => {
  it('链接指向 main 分支中存在的 demo 目录', () => {
    expect(statSync(demoPath).isDirectory()).toBe(true)

    for (const [, docPath] of docs) {
      const content = readFileSync(docPath, 'utf8')
      const links = Array.from(
        content.matchAll(/https:\/\/github\.com\/weapp-tailwindcss\/weapp-tailwindcss\/tree\/[^\s)]+\/demo\/uni-app-x-vdom-tailwindcss-v4/g),
        match => match[0],
      )

      expect(links).toHaveLength(2)
      expect(links).toEqual([demoUrl, demoUrl])
    }
  })
})
