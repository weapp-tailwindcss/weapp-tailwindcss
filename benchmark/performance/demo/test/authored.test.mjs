import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { compileAuthored, prepareInjectedCss } from '../authored.mjs'
import { connectMpxSidecar, mpxSidecarOwner } from '../authored-mpx.mjs'
import { hash } from '../published.mjs'
import { preprocessInjectedCss } from '../authored-vite.mjs'

it('Webpack 样式注入按原文消费，不按文件扩展名额外加载预处理器', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cost-authored-'))
  const css = '.entry { color: #0891b2; }'
  try {
    for (const extension of ['scss', 'less']) {
      const sourceAbsolutePath = path.join(directory, `entry.${extension}`)
      await writeFile(sourceAbsolutePath, css)
      const require = () => { throw new Error('原文注入不得加载预处理器') }
      expect(await prepareInjectedCss({ sourceAbsolutePath, preprocess: true }, 'weapp-style-injector/webpack/mpx', require)).toBe(css)
      expect(await prepareInjectedCss({ sourceAbsolutePath, preprocess: true }, 'weapp-style-injector/vite/taro', require)).toBe(css)
      expect(await prepareInjectedCss({ sourceAbsolutePath, preprocess: false }, 'weapp-style-injector/vite/uni-app', require)).toBe(css)
    }
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('启用 Vite 预处理时执行真实 Sass，而不是删除预处理语法', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cost-authored-'))
  try {
    const sourceAbsolutePath = path.join(directory, 'entry.scss')
    await writeFile(sourceAbsolutePath, '$space: 2px; .entry { margin: $space; }')
    expect(await prepareInjectedCss({ sourceAbsolutePath, preprocess: true }, 'weapp-style-injector/vite/uni-app', createRequire(import.meta.url), { root: process.cwd(), css: { transformer: 'postcss', preprocessorMaxWorkers: 0, devSourcemap: false } })).toContain('margin: 2px')
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('真实 Vite 配置中的闭包别名在预处理期间保持可执行', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cost-authored-alias-'))
  try {
    const file = path.join(directory, 'entry.css')
    const target = path.join(directory, 'tokens.css')
    await writeFile(target, '.entry { margin: 7px; }')
    const input = '@import "custom";'
    const require = createRequire(import.meta.url)
    const { resolveConfig } = await import('vite')
    let calls = 0
    const config = await resolveConfig({ configFile: false, root: directory, resolve: { alias: [{ find: 'custom', replacement: target, customResolver() { calls++; return target } }] } }, 'build')
    const output = await preprocessInjectedCss(input, file, require, config, true)
    expect(output).toContain('margin: 7px')
    expect(calls).toBeGreaterThan(0)
    await writeFile(file, input)
    const evidence = [{ file, inputHash: hash(input), output }]
    expect(await prepareInjectedCss({ sourceAbsolutePath: file }, 'weapp-style-injector/vite/uni-app', require, evidence)).toBe(output)
    await writeFile(file, input + '\n.changed{}')
    await expect(prepareInjectedCss({ sourceAbsolutePath: file }, 'weapp-style-injector/vite/uni-app', require, evidence)).rejects.toThrow('本轮输入')
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('Mpx sidecar 必须由已发现的页面源码实际导入，已有导入不重复添加', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cost-mpx-sidecar-'))
  try {
    const page = path.join(directory, 'entry.mpx')
    const css = path.join(directory, 'entry.css')
    await writeFile(page, '<template><view/></template>')
    const result = new Map()
    await connectMpxSidecar(result, directory, css, ['entry.mpx'])
    expect(result.get('entry.mpx')).toContain('<style src="./entry.css"></style>')
    const first = result.get('entry.mpx')
    await connectMpxSidecar(result, directory, css, ['entry.mpx'])
    expect(result.get('entry.mpx')).toBe(first)
    await expect(connectMpxSidecar(new Map(), directory, css, ['unrelated.mpx'])).rejects.toThrow('源码归属')
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('Taro 配置模块即使被作用域扫描返回，也不能插入只能由组件消费的 CSS 导入', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'cost-authored-targets-'))
  try {
    const pkg = path.join(project, 'node_modules', 'weapp-style-injector')
    await mkdir(pkg, { recursive: true })
    await writeFile(path.join(pkg, 'package.json'), '{"main":"index.cjs"}')
    const sourceAbsolutePath = path.join(project, 'entry.css')
    const targets = ['page.tsx', 'page.config.ts'].map(fileName => ({ fileName, sourceAbsolutePath: path.join(project, fileName) }))
    await writeFile(sourceAbsolutePath, '.entry{color:red}')
    for (const target of targets) await writeFile(target.sourceAbsolutePath, 'export default {}')
    await writeFile(path.join(pkg, 'index.cjs'), `exports.resolveTaroSubPackages = () => ${JSON.stringify([{ sourceAbsolutePath, sourceModules: targets }])}; exports.isFileMatchedBySubpackageScope = exports.isSourceFileMatchedBySubpackageScope = () => true;`)
    const result = await compileAuthored({ project, item: { family: 'taro', target: 'weapp', name: 'style-injector-taro-webpack-react' } }, [{ key: 'options', value: { module: 'weapp-style-injector/webpack/taro', options: {} } }], project, ['page.tsx', 'entry.css'])
    expect(result.has('page.config.ts')).toBe(false)
    expect(result.get('page.tsx')).toContain("import './page.tsx.cost.css'")
    expect(result.get('page.tsx.cost.css')).toBe('.entry{color:red}')
  }
  finally { await rm(project, { recursive: true, force: true }) }
})

it('Mpx 源码归属兼容 POSIX、Windows 盘符与相对路径，不跨根匹配', () => {
  expect(mpxSidecarOwner('/app', 'feature/entry.css', ['feature/entry.mpx'], path.posix)).toBe('/app/feature/entry.mpx')
  expect(mpxSidecarOwner('C:\\app', 'C:\\app\\feature\\entry.css', ['feature\\entry.mpx'], path.win32)).toBe('C:\\app\\feature\\entry.mpx')
  expect(mpxSidecarOwner('C:\\app', 'feature\\entry.css', ['C:\\app\\feature\\entry.mpx'], path.win32)).toBe('C:\\app\\feature\\entry.mpx')
  expect(() => mpxSidecarOwner('C:\\app', 'C:\\app\\entry.css', ['D:\\app\\entry.mpx'], path.win32)).toThrow('源码归属')
})
