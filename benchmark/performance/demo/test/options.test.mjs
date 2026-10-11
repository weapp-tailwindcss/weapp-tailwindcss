import path from 'node:path'
import { expect, it } from 'vitest'
import { cssEntries } from '../options.mjs'

it('读取直接配置和 HBuilderX 预设的嵌套入口，保留入口顺序', () => {
  const entries = [path.resolve('main.css'), path.resolve('sub/style.css')]
  expect(cssEntries({ cssEntries: entries })).toEqual(entries)
  expect(cssEntries({ tailwindcss: { v4: { cssEntries: entries } } })).toEqual(entries)
  expect(cssEntries({ tailwindcssRuntimeOptions: { tailwindcss: { v4: { cssEntries: entries } } } })).toEqual(entries)
  expect(cssEntries({ cssEntries: entries, tailwindcss: { v4: { cssEntries: ['ignored.css'] } } })).toEqual(entries)
  expect(() => cssEntries({})).toThrow('配置声明 CSS 入口')
})
