import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { auditArchitecture } from '../../../../scripts/architecture/audit'
import { readImports } from '../../../../scripts/architecture/imports'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function fixture(files: Record<string, string>, dependencies: Record<string, string> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'architecture-contract-'))
  directories.push(root)
  const packageRoot = path.join(root, 'packages', 'weapp-tailwindcss')
  await mkdir(path.join(packageRoot, 'src'), { recursive: true })
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'weapp-tailwindcss', dependencies, exports: { '.': './dist/index.js' } }))
  await writeFile(path.join(packageRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: { moduleResolution: 'bundler', paths: { '@/*': ['./src/*'] } } }))
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(packageRoot, 'src', file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  return { root, packageRoot }
}

describe('架构检查器', () => {
  it('区分值、类型、重导出、动态导入及 require', () => {
    expect(readImports('entry.ts', `import type { A } from './a'; import { type B } from './b'; export * from './c'; export type * from './d'; import('./e'); require('./f'); type G = import('./g').G;`)).toEqual([
      { specifier: './a', typeOnly: true }, { specifier: './b', typeOnly: true },
      { specifier: './c', typeOnly: false }, { specifier: './d', typeOnly: true },
      { specifier: './e', typeOnly: false }, { specifier: './f', typeOnly: false },
      { specifier: './g', typeOnly: true },
    ])
  })
  it('允许纯类型循环，拒绝经别名与 js 扩展名的值循环', async () => {
    const { root, packageRoot } = await fixture({ 'a.ts': "import type { B } from './b.js'; export interface A {}", 'b.ts': "import type { A } from '@/a'; export interface B {}" })
    expect(auditArchitecture(root).errors).toEqual([])
    await writeFile(path.join(packageRoot, 'src/a.ts'), "export * from './b.js'")
    await writeFile(path.join(packageRoot, 'src/b.ts'), "import '@/a'")
    expect(auditArchitecture(root).errors.join('\n')).toContain('值依赖循环')
  })
  it.each(["import '../facade'", "import type { Options } from '../facade'"])('核心不能经聚合导出引用适配器：%s', async (source) => {
    const { root } = await fixture({ 'core/entry.ts': source, 'facade.ts': "export * from './bundlers/adapter'", 'bundlers/adapter.ts': 'export interface Options {}' })
    const errors = auditArchitecture(root).errors.join('\n')
    expect(errors).toContain('核心反向依赖')
    expect(errors).toContain('facade.ts ->')
  })
  it('扫描独立核心包和声明文件中的适配器引用', async () => {
    const { root } = await fixture({ 'bundlers/adapter.ts': 'export interface Options {}' })
    const engine = path.join(root, 'packages', 'engine')
    await mkdir(path.join(engine, 'src'), { recursive: true })
    await writeFile(path.join(engine, 'package.json'), JSON.stringify({ name: '@weapp-tailwindcss/engine' }))
    await writeFile(path.join(engine, 'src', 'types.d.ts'), "export type { Options } from '../../weapp-tailwindcss/src/bundlers/adapter'")
    expect(auditArchitecture(root).errors.join('\n')).toContain('核心反向依赖')
  })
  it('解析静态拼接的动态导入', () => {
    expect(readImports('entry.ts', "const base = './'; import(base + 'adapter'); require(`./adapter`)")).toEqual([
      { specifier: './adapter', typeOnly: false }, { specifier: './adapter', typeOnly: false },
    ])
  })
  it('拒绝未解析的自定义路径别名', async () => {
    const { root, packageRoot } = await fixture({ 'a.ts': "import '~core/missing'" })
    await writeFile(path.join(packageRoot, 'tsconfig.json'), JSON.stringify({ compilerOptions: { paths: { '~core/*': ['./src/*'] } } }))
    expect(auditArchitecture(root).errors.join('\n')).toContain('无法解析本地依赖')
  })
  it('静态路径解析遵循词法作用域及参数遮蔽', () => {
    expect(readImports('entry.ts', `const target = './outer'; { const target = './inner'; import(target) } import(target); function load(target: string) { return import(target) }`)).toEqual([
      { specifier: './inner', typeOnly: false }, { specifier: './outer', typeOnly: false },
    ])
  })
  it('拒绝未解析的本地引用', async () => {
    const { root } = await fixture({ 'a.ts': "import './missing'" })
    expect(auditArchitecture(root).errors.join('\n')).toContain('无法解析本地依赖')
  })
  it('忽略源码目录中的依赖缓存', async () => {
    const { root, packageRoot } = await fixture({ 'a.ts': 'export const value = 1' })
    const generated = path.join(packageRoot, 'src', 'node_modules', '.cache', 'jiti', 'generated.cjs')
    await mkdir(path.dirname(generated), { recursive: true })
    await writeFile(generated, 'require("../../dark-mode.cjs")')
    expect(auditArchitecture(root).errors).toEqual([])
  })
  it('拒绝通过生产源码范围外的本地模块绕过检查', async () => {
    const { root, packageRoot } = await fixture({ 'core/entry.ts': "import '../../bridge'" })
    await writeFile(path.join(packageRoot, 'bridge.ts'), "export * from './src/bundlers/adapter'")
    expect(auditArchitecture(root).errors.join('\n')).toContain('本地依赖超出生产源码范围')
  })
  it('基础扫描包不能反向依赖引擎，包括纯类型依赖', async () => {
    const { root } = await fixture({})
    for (const name of ['source-scan', 'engine']) {
      const base = path.join(root, 'packages', name)
      await mkdir(path.join(base, 'src'), { recursive: true })
      await writeFile(path.join(base, 'package.json'), JSON.stringify({ name: `@weapp-tailwindcss/${name}`, exports: { '.': './dist/index.js' } }))
      await writeFile(path.join(base, 'src/index.ts'), name === 'engine' ? 'export interface Engine {}' : "import type { Engine } from '@weapp-tailwindcss/engine'")
    }
    expect(auditArchitecture(root).errors.join('\n')).toContain('基础包反向依赖')
  })
  it.each([
    "import 'weapp-tailwindcss'",
    "import type { Options } from 'weapp-tailwindcss'",
    "export * from '../../weapp-tailwindcss/src/index'",
    "export type { Options } from '../../weapp-tailwindcss/src/index'",
  ])('环境包不得反向引用主包：%s', async (source) => {
    const { root } = await fixture({ 'index.ts': 'export interface Options {}' })
    const base = path.join(root, 'packages', 'env')
    await mkdir(path.join(base, 'src'), { recursive: true })
    await writeFile(path.join(base, 'package.json'), JSON.stringify({ name: '@weapp-tailwindcss/env', exports: { '.': './dist/index.js' } }))
    await writeFile(path.join(base, 'src', 'index.ts'), source)
    expect(auditArchitecture(root).errors.join('\n')).toContain('基础包反向依赖')
  })
  it.each(['dependencies', 'optionalDependencies', 'peerDependencies'])('环境包不允许未使用的 %s', async (field) => {
    const { root } = await fixture({})
    const base = path.join(root, 'packages', 'env')
    await mkdir(path.join(base, 'src'), { recursive: true })
    await writeFile(path.join(base, 'package.json'), JSON.stringify({ name: '@weapp-tailwindcss/env', [field]: { tailwindcss: '*' } }))
    await writeFile(path.join(base, 'src', 'index.ts'), 'export const value = 1')
    expect(auditArchitecture(root).errors.join('\n')).toContain('环境包不允许生产依赖')
  })
  it('环境包不能通过相对路径引用其他基础包', async () => {
    const { root } = await fixture({})
    for (const name of ['env', 'logger']) {
      const base = path.join(root, 'packages', name)
      await mkdir(path.join(base, 'src'), { recursive: true })
      await writeFile(path.join(base, 'package.json'), JSON.stringify({ name: `@weapp-tailwindcss/${name}` }))
      await writeFile(path.join(base, 'src', 'index.ts'), name === 'env' ? "export * from '../../logger/src/index'" : 'export const value = 1')
    }
    expect(auditArchitecture(root).errors.join('\n')).toContain('基础包反向依赖')
  })
  it('允许主包使用环境包的根入口与 Node 内置模块', async () => {
    const { root } = await fixture({ 'framework/index.ts': "export * from '@weapp-tailwindcss/env'" })
    const base = path.join(root, 'packages', 'env')
    await mkdir(path.join(base, 'src'), { recursive: true })
    await writeFile(path.join(base, 'package.json'), JSON.stringify({ name: '@weapp-tailwindcss/env', exports: { '.': './dist/index.js' } }))
    await writeFile(path.join(base, 'src', 'index.ts'), "import 'node:fs'; export const value = 1")
    expect(auditArchitecture(root).errors).toEqual([])
  })
  it('动态 import 与 require 也不能构成循环', async () => {
    const { root } = await fixture({ 'a.ts': "export const load = () => import('./b')", 'b.ts': "require('./a')" })
    expect(auditArchitecture(root).errors.join('\n')).toContain('值依赖循环')
  })
  it('跨包导出解析到源码，并检查包级闭环', async () => {
    const { root } = await fixture({ 'index.ts': "export * from 'helper'" }, { helper: 'workspace:*' })
    const helper = path.join(root, 'packages/helper')
    await mkdir(path.join(helper, 'src'), { recursive: true })
    await writeFile(path.join(helper, 'package.json'), JSON.stringify({ name: 'helper', exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } }, dependencies: { 'weapp-tailwindcss': 'workspace:*' } }))
    await writeFile(path.join(helper, 'src/index.ts'), "export * from 'weapp-tailwindcss'")
    const errors = auditArchitecture(root).errors.join('\n')
    expect(errors).toContain('包依赖循环')
    expect(errors).toContain('值依赖循环')
    expect(errors).not.toContain('无法解析')
  })
})
