import path from 'node:path'
import { normalizePath } from 'vite'
import { describe, expect, it } from 'vitest'
import { collectUniAppXHarmonyApplyStyleSourcesFromSource } from '@/uni-app-x/style-asset/style-value'
import { normalizeRelativeTailwindReferences } from '@/uni-app-x/vite/style-request'

const cases = [
  [normalizePath(path.resolve('/project/views/probe.uvue')), normalizePath(path.resolve('/project/main.css'))],
  ['C:\\项目 空格\\views\\probe.uvue', 'C:/项目 空格/main.css'],
  ['C:/project/views/probe.uvue', 'C:/project/main.css'],
  ['\\\\server\\share\\views\\probe.uvue', '//server/share/main.css'],
  ['//server/share/views/probe.uvue', '//server/share/main.css'],
  ['C:\\probe.uvue', 'C:/main.css'],
  [normalizePath(path.resolve('/probe.uvue')), normalizePath(path.resolve('/main.css'))],
  ['./views/probe.uvue', normalizePath(path.resolve('main.css'))],
]

describe.each([
  ['Web', (css: string, id: string) => normalizeRelativeTailwindReferences(css, id)],
  ['Harmony', (css: string, id: string) => collectUniAppXHarmonyApplyStyleSourcesFromSource(`<style>${css}</style>`, id)[0]],
] as const)('%s @reference 文件系统归属', (_name, resolve) => {
  it.each(cases)('相对引用保留来源根目录：%s', (file, expected) => {
    const source = '@reference "../main.css";\n.probe { @apply flex; }'
    expect(resolve(source, `${file}?vue&type=style&index=0`)).toBe(`@reference "${expected}";\n.probe { @apply flex; }`)
  })
})
