import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export async function preprocessInjectedCss(css, file, require, captured, resolved = false) {
  assert.ok(captured?.root && captured.css, 'uni 样式注入需要真实 Vite 配置证据')
  const manifestPath = require.resolve('vite/package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const exported = manifest.exports?.['.']
  const entry = typeof exported === 'string' ? exported : exported?.import ?? exported?.default
  const importPath = typeof entry === 'string' ? entry : entry?.default ?? manifest.module
  assert.ok(importPath, '消费项目的 Vite 没有公开 ESM 入口')
  const vite = await import(pathToFileURL(path.resolve(path.dirname(manifestPath), importPath)).href)
  // 与发布版 uni 注入器相同：使用消费项目 Vite，两次预处理，禁用额外插件和 CSS 配置。
  const base = resolved ? captured : await vite.resolveConfig({ ...captured, configFile: false, plugins: [], logLevel: 'silent' }, 'build', captured.mode)
  const config = { ...base, css: { transformer: captured.css.transformer, preprocessorMaxWorkers: captured.css.preprocessorMaxWorkers, devSourcemap: false }, plugins: [] }
  const initial = await vite.preprocessCSS(css, file, config)
  return (await vite.preprocessCSS(initial.code, file, config)).code
}
