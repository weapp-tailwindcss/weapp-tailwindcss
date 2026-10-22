import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseSync } from '@babel/core'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { repo } from './catalog.mjs'
import { evaluateCommonJs, packageFile, packageSource, taroRequire } from './taro-package.fixture.mjs'

const { H5 } = taroRequire('@tarojs/plugin-platform-harmony-hybrid')
function setup(framework = 'react', options = {}) {
  const viteConfig = { plugins: [] }
  const context = { sourceDir: path.resolve('fixture-source'), frameworkExts: ['.vue'], loaderMeta: { extraImportForWeb: '// control\n', execBeforeCreateWebApp: '' } }
  const program = Object.create(H5.prototype)
  program.ctx = {
    initialConfig: { framework, h5: options },
    runnerUtils: { getViteH5CompilerContext: async () => context },
    modifyViteConfig: callback => callback({ viteConfig }),
  }
  program.modifyViteConfig()
  return { program, context, plugins: viteConfig.plugins }
}

it.each(['react', 'vue3'])('%s 使用 Harmony 自身四个 alias，并在同一 compiler context 只登记一次初始化', async (framework) => {
  const { program, context, plugins } = setup(framework)
  const alias = plugins.find(plugin => plugin.name.endsWith('-alias')).config().resolve.alias
  expect(alias.map(item => item.replacement)).toEqual([program.componentLibrary, program.componentAdapter, program.routerLibrary, program.apiLibrary])
  expect(alias[0].find.test('@tarojs/components')).toBe(true)
  expect(alias[0].find.test('@tarojs/components-other')).toBe(false)
  const metadata = plugins.find(plugin => plugin.name.endsWith('-loader-meta'))
  await metadata.buildStart.call({})
  const first = { ...context.loaderMeta }
  await metadata.buildStart.call({})
  expect(context.loaderMeta).toEqual(first)
  expect(first.extraImportForWeb).toContain('// control')
  expect(first.execBeforeCreateWebApp).toContain('defineCustomElementTaroPullToRefreshCore')
  if (framework === 'vue3') {
    expect(first.execBeforeCreateWebApp).toContain('initVue3Components(component, list)')
  }
})

it('HTML 与旧组件包装的初始化通过相应选项选择', async () => {
  for (const options of [{ useHtmlComponents: true }, { useDeprecatedAdapterComponent: true }]) {
    const { context, plugins } = setup('react', options)
    await plugins.find(plugin => plugin.name.endsWith('-loader-meta')).buildStart.call({})
    expect(context.loaderMeta.execBeforeCreateWebApp).toContain(options.useHtmlComponents ? 'config.PullDownRefresh' : 'defineCustomElements(window)')
  }
})

it.each([{}, { custom: 'preserved' }])('已有不完整 loaderMeta %j 不能导致注入 undefined', async (initial) => {
  const { context, plugins } = setup('vue3')
  context.loaderMeta = { ...initial }
  await plugins.find(plugin => plugin.name.endsWith('-loader-meta')).buildStart.call({})
  expect(context.loaderMeta.custom).toBe(initial.custom)
  expect(context.loaderMeta.extraImportForWeb).not.toContain('undefined')
  expect(context.loaderMeta.execBeforeCreateWebApp).not.toContain('undefined')
})

it('Windows HTML 组件 CSS 模块路径通过 JS 字面量无损注入', async () => {
  const { program, context } = setup('react', { useHtmlComponents: true })
  const plugins = []
  program.ctx.modifyViteConfig = callback => callback({ viteConfig: { plugins } })
  const platformRequire = taroRequire('node:module').createRequire(packageFile('plugin-platform-harmony-hybrid', 'package.json'))
  const fixtureRequire = Object.assign(id => platformRequire(id), {
    resolve: () => String.raw`C:\repo\node_modules\@tarojs\components-react\dist\index.css`,
  })
  evaluateCommonJs(packageSource('plugin-platform-harmony-hybrid', 'dist/vite.js'), fixtureRequire).register(program)
  await plugins.find(plugin => plugin.name.endsWith('-loader-meta')).buildStart.call({})
  const ast = parseSync(context.loaderMeta.extraImportForWeb, { babelrc: false, configFile: false })
  expect(ast.program.body.find(node => node.type === 'ImportDeclaration').source.value).toBe('C:/repo/node_modules/@tarojs/components-react/dist/index.css')
})

it.each([path.resolve('fixture-source'), String.raw`C:\fixture\source`, 'fixture-source'])('%s 的应用 API 转换保留路由选择和文件归属', async (sourceDir) => {
  const { context, plugins } = setup()
  context.sourceDir = sourceDir
  const paths = sourceDir.includes('\\') ? path.win32 : path
  const api = plugins.find(plugin => plugin.name.endsWith('-api'))
  const input = 'import { getSystemInfoSync, navigateTo } from \'@tarojs/taro\'; console.log(getSystemInfoSync(), navigateTo);'
  const output = await api.transform.call({}, input, `\0${paths.join(context.sourceDir, 'page.js')}?fixture=1`)
  const ast = parseSync(output.code, { babelrc: false, configFile: false })
  const imported = ast.program.body.find(node => node.type === 'ImportDeclaration' && node.source.value === '@tarojs/taro')
  expect(imported.specifiers.filter(node => node.type === 'ImportSpecifier').map(node => node.imported.name)).toEqual(['getSystemInfoSync'])
  const defaultName = imported.specifiers.find(node => node.type === 'ImportDefaultSpecifier').local.name
  const route = ast.program.body.at(-1).expression.arguments.at(-1)
  expect(route.type).toBe('MemberExpression')
  expect([route.object.name, route.property.name]).toEqual([defaultName, 'navigateTo'])
  expect(output.map).toBeTruthy()
  expect(await api.transform.call({}, input, paths.join(`${context.sourceDir}-other`, 'page.js'))).toBeUndefined()
  expect(await api.transform.call({}, input, paths.join(context.sourceDir, 'page.css'))).toBeUndefined()
  if (paths === path.win32) {
    expect(await api.transform.call({}, input, String.raw`D:\fixture\source\page.js`)).toBeUndefined()
  }
})

it('补丁不依赖项目根目录偶然提升的 Babel 依赖', () => {
  const workspace = parse(readFileSync(path.join(repo, 'pnpm-workspace.yaml'), 'utf8'))
  expect(workspace.packageExtensions?.['@tarojs/plugin-platform-harmony-hybrid@4.2.1']?.dependencies?.['@babel/core']).toBeTruthy()
  const platformRequire = taroRequire('node:module').createRequire(packageFile('plugin-platform-harmony-hybrid', 'package.json'))
  expect(platformRequire('@babel/core').transformAsync).toBeTypeOf('function')
})
