import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadUniPlugin, resolveHBuilderXCompilerRoot, resolveUniPlugin } from '../demo/uni-app-x-plugin'

const temporaryRoots: string[] = []

async function packageFixture(root: string, content: string) {
  const directory = path.join(root, 'node_modules', '@dcloudio', 'vite-plugin-uni')
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: '@dcloudio/vite-plugin-uni', main: 'index.cjs' }))
  await writeFile(path.join(directory, 'index.cjs'), content)
  return realpath(path.join(directory, 'index.cjs'))
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'uni-toolchain-'))
  temporaryRoots.push(root)
  const project = path.join(root, '项目 & demo')
  const compiler = path.join(root, 'IDE compiler')
  await mkdir(project)
  const configUrl = pathToFileURL(path.join(project, 'vite.config.ts')).href
  return { root, project, compiler, configUrl }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('uni-app x 工具链身份', () => {
  it('IDE 路径优先于项目插件且不加载旧版模块', async () => {
    const { project, compiler, configUrl } = await fixture()
    await packageFixture(project, 'throw new Error("旧版项目插件不应求值")')
    const entry = await packageFixture(compiler, 'exports.default = () => ({ name: "IDE Vapor compiler" })')
    const env = { HX_PLUGIN_PATHS: JSON.stringify({ 'uniapp-cli-vite': compiler }) }
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})

    expect(resolveUniPlugin(configUrl, env)).toEqual({ modulePath: entry, source: 'HBuilderX' })
    expect(loadUniPlugin(configUrl, env)()).toEqual({ name: 'IDE Vapor compiler' })
    expect(log).toHaveBeenCalledWith(`[uni-toolchain] HBuilderX: ${entry}`)
  })

  it('npm CLI 从调用项目加载 CJS 工厂且不使用无关 UNI_CLI_CONTEXT', async () => {
    const { project, compiler, configUrl } = await fixture()
    const entry = await packageFixture(project, 'module.exports = () => ({ name: "project compiler" })')
    await packageFixture(compiler, 'throw new Error("npm 构建不应加载 IDE 插件")')
    const env = { UNI_CLI_CONTEXT: compiler }
    expect(resolveUniPlugin(configUrl, env)).toEqual({ modulePath: entry, source: 'npm' })
    expect(loadUniPlugin(configUrl, env)()).toEqual({ name: 'project compiler' })
  })

  it('IDE 插件缺失时失败，不向父目录或项目依赖回退', async () => {
    const { root, project, compiler, configUrl } = await fixture()
    await packageFixture(project, 'module.exports = () => ({ name: "project" })')
    await packageFixture(root, 'module.exports = () => ({ name: "ancestor" })')
    expect(() => loadUniPlugin(configUrl, { HX_PLUGIN_PATHS: JSON.stringify({ 'uniapp-cli-vite': compiler }) })).toThrow()
  })

  it('拒绝没有工厂函数的编译插件', async () => {
    const { project, configUrl } = await fixture()
    await packageFixture(project, 'module.exports = { default: {} }')
    expect(() => loadUniPlugin(configUrl, {})).toThrow('未导出工厂函数')
  })

  it.each([
    ['POSIX 根路径', path.posix, '/', '/uniapp-cli-vite'],
    ['POSIX 路径', path.posix, '/Applications/HBuilder X/plugins', '/Applications/HBuilder X/plugins/uniapp-cli-vite'],
    ['Windows 盘符', path.win32, 'C:\\HBuilder X\\plugins', 'C:\\HBuilder X\\plugins\\uniapp-cli-vite'],
    ['Windows 盘符根路径', path.win32, 'C:\\', 'C:\\uniapp-cli-vite'],
    ['Windows UNC', path.win32, '\\\\server\\share\\plugins', '\\\\server\\share\\plugins\\uniapp-cli-vite'],
  ])('%s 按原生文件路径定位', (_name, pathApi, plugins, expected) => {
    expect(resolveHBuilderXCompilerRoot({ UNI_HBUILDERX_PLUGINS: plugins }, pathApi)).toBe(expected)
  })

  it('支持 HX_APP_ROOT 且优先使用 IDE 的插件映射', () => {
    expect(resolveHBuilderXCompilerRoot({ HX_APP_ROOT: '/IDE' }, path.posix)).toBe('/IDE/plugins/uniapp-cli-vite')
    expect(resolveHBuilderXCompilerRoot({
      HX_APP_ROOT: '/IDE',
      UNI_HBUILDERX_PLUGINS: '/IDE/plugins',
      HX_PLUGIN_PATHS: JSON.stringify({ 'uniapp-cli-vite': '/updated/compiler' }),
    }, path.posix)).toBe('/updated/compiler')
  })

  it.each(['{}', '[]', 'null', '{', '{"uniapp-cli-vite":42}', '{"uniapp-cli-vite":"relative/compiler"}'])('拒绝不完整或非法的 IDE 身份 %s', (mapping) => {
    expect(() => resolveHBuilderXCompilerRoot({ HX_PLUGIN_PATHS: mapping, UNI_HBUILDERX_PLUGINS: '/fallback' }, path.posix)).toThrow()
  })

  it.each([
    ['POSIX 相对路径', path.posix, 'plugins'],
    ['Windows 相对路径', path.win32, 'plugins'],
    ['Windows 盘符相对路径', path.win32, 'C:plugins'],
  ])('拒绝 %s', (_name, pathApi, plugins) => {
    expect(() => resolveHBuilderXCompilerRoot({ UNI_HBUILDERX_PLUGINS: plugins }, pathApi)).toThrow('绝对路径')
  })

  it.each(['uni-app-x-vapor-tailwindcss-v4', 'uni-app-x-vdom-tailwindcss-v4', 'issue-1144-uni-app-x-web', 'uni-app-vite-vue3-hbuilderx-tailwindcss-v4'])('%s 的配置先选择工具链再加载插件', async (project) => {
    const config = await readFile(new URL(`../demo/${project}/vite.config.ts`, import.meta.url), 'utf8')
    const source = ts.createSourceFile('vite.config.ts', config, ts.ScriptTarget.Latest, true)
    const eagerImports = source.statements.filter(node => ts.isImportDeclaration(node)
      && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text === '@dcloudio/vite-plugin-uni')
    expect(eagerImports).toHaveLength(0)
  })
})
