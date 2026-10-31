import { expect, it } from 'vitest'
import { assertWatchCssAssets } from '../src/watch-lifecycle/css-assets.mjs'

const asset = (fileName, source) => ({ type: 'asset', fileName, source })
const chunk = (fileName, importedCss) => ({ type: 'chunk', fileName, viteMetadata: { importedCss: new Set(importedCss) } })

it('CSS 合并到另一个入口不能满足缺失资产的静态引用', () => {
  const bundle = {
    'main.css': asset('main.css', '.author-main{}.author-secondary{}'),
    'main.js': chunk('main.js', ['main.css']),
    'secondary.js': chunk('secondary.js', ['secondary.css']),
  }
  expect(() => assertWatchCssAssets(bundle)).toThrow('secondary.js → secondary.css')
  bundle['secondary.css'] = asset('secondary.css', '.author-secondary{}')
  expect(() => assertWatchCssAssets(bundle)).not.toThrow()
})

it('共享 chunk 的 CSS 也必须存在，不能只验证入口 chunk', () => {
  const bundle = {
    'entry.js': chunk('entry.js', []),
    'shared.js': { ...chunk('shared.js', ['assets/shared.css']), isEntry: false },
  }
  expect(() => assertWatchCssAssets(bundle)).toThrow('shared.js → assets/shared.css')
  bundle['assets/shared.css'] = asset('assets/shared.css', '.shared{}')
  expect(() => assertWatchCssAssets(bundle)).not.toThrow()
})

it('元数据缺失不能当作没有 CSS 引用', () => {
  expect(() => assertWatchCssAssets({ entry: { type: 'chunk', fileName: 'entry.js' } })).toThrow('元数据')
  expect(() => assertWatchCssAssets({ entry: chunk('entry.js', []) })).not.toThrow()
})
