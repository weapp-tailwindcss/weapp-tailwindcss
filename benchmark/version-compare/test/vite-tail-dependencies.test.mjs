import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isPathInside, prepareViteTailDependencies } from '../scripts/diagnostics/vite-tail-dependencies.mjs'
import { viteTailProject } from '../scripts/diagnostics/vite-tail-observer.mjs'
import { rollupSource, viteSource } from './vite-tail-fixtures.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})
async function write(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, text)
}
async function fixture() {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-tail-prepare-'))
  roots.push(parent)
  const root = path.join(parent, 'copy')
  await write(path.join(root, 'demo/taro-vite-react-tailwindcss-v4/package.json'), '{}')
  for (const name of ['@tarojs/vite-runner', 'vite', 'rollup']) {
    const directory = path.join(root, 'node_modules', name)
    await write(path.join(directory, 'package.json'), JSON.stringify({ name, version: name === 'vite' ? '4.5.14' : name === 'rollup' ? '3.30.0' : '4.2.1', main: 'index.cjs', exports: { '.': { require: './index.cjs', import: './dist/index.js' } } }))
    await write(path.join(directory, 'index.cjs'), 'module.exports = {}')
    await write(path.join(directory, 'dist/index.js'), 'export * from \'./chunks/implementation.js\'')
  }
  const vite = path.join(root, 'node_modules/vite/dist/chunks/implementation.js')
  const rollup = path.join(root, 'node_modules/rollup/dist/chunks/implementation.js')
  await write(vite, viteSource)
  await write(rollup, rollupSource)
  return { parent, root, vite, rollup, evidence: path.join(parent, 'evidence') }
}

describe('Taro 准备副本的实际依赖图插桩', () => {
  it('记录实际版本及哈希，rename 脱离硬链接且不修改 store 原文件', async () => {
    const value = await fixture()
    const original = path.join(value.parent, 'store-original.js')
    await fs.link(value.vite, original)
    const manifest = await prepareViteTailDependencies(value.root, value.parent, value.evidence, viteTailProject)
    expect(manifest.packages.map(item => [item.name, item.version])).toEqual([['@tarojs/vite-runner', '4.2.1'], ['vite', '4.5.14'], ['rollup', '3.30.0']])
    expect(manifest.files).toHaveLength(2)
    expect(manifest.files.every(item => item.originalSha256 !== item.instrumentedSha256)).toBe(true)
    expect(await fs.readFile(original, 'utf8')).toBe(viteSource)
    expect(await fs.readFile(value.vite, 'utf8')).toContain('__weappTailDiagnosticToken')
    await expect(prepareViteTailDependencies(value.root, value.parent, value.evidence, viteTailProject)).rejects.toThrow('重复')
  })

  it('未知第二依赖布局时第一份源码也不写，拒绝半套 AST 协议', async () => {
    const value = await fixture()
    await fs.writeFile(value.rollup, rollupSource.replace('\'writeBundle\'', '\'unknown\''))
    await expect(prepareViteTailDependencies(value.root, value.parent, value.evidence, viteTailProject)).rejects.toThrow('唯一')
    expect(await fs.readFile(value.vite, 'utf8')).toBe(viteSource)
    await expect(fs.access(path.join(value.evidence, 'tail-dependencies.json'))).rejects.toThrow()
  })

  it('拒绝来源 checkout、Git 副本及依赖符号链接逃逸，未知项目默认不做工作', async () => {
    const value = await fixture()
    await expect(prepareViteTailDependencies(value.root, value.root, value.evidence, viteTailProject)).rejects.toThrow('源码工作树')
    await write(path.join(value.root, '.git'), 'gitdir: elsewhere')
    await expect(prepareViteTailDependencies(value.root, value.parent, value.evidence, viteTailProject)).rejects.toThrow('Git 元数据')
    await fs.rm(path.join(value.root, '.git'))
    const outside = path.join(value.parent, 'outside.js')
    await write(outside, rollupSource)
    await fs.rm(value.rollup)
    await fs.symlink(outside, value.rollup)
    await expect(prepareViteTailDependencies(value.root, value.parent, value.evidence, viteTailProject)).rejects.toThrow('逃逸')
    expect(await fs.readFile(value.vite, 'utf8')).toBe(viteSource)
    expect(await fs.readFile(outside, 'utf8')).toBe(rollupSource)
    await expect(prepareViteTailDependencies('absent', 'absent', 'absent', 'other')).resolves.toBeUndefined()
  })

  it('路径边界覆盖 POSIX、Windows 反斜杠、盘符、根目录和相对路径', () => {
    for (const [paths, root, file, expected] of [
      [path.posix, '/copy', '/copy/node_modules/x.js', true],
      [path.posix, '/copy', '/copy-other/x.js', false],
      [path.posix, '/', '/copy/x.js', true],
      [path.posix, 'copy', 'copy/../other', false],
      [path.win32, 'C:\\copy', 'C:\\copy\\node_modules\\x.js', true],
      [path.win32, 'C:\\copy', 'D:\\copy\\x.js', false],
      [path.win32, 'C:\\', 'C:\\copy\\x.js', true],
      [path.win32, 'copy', 'copy\\..\\other', false],
    ]) {
      expect(isPathInside(root, file, paths)).toBe(expected)
    }
  })
})
