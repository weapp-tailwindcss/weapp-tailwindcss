import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readTemplatePageConfigs, resolveTemplatePageConfigFile } from './template-ide/config'

describe('微信模板注册页面产物', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'template-pages-'))
  })
  afterEach(async () => rm(root, { recursive: true, force: true }))
  async function file(name: string, content: string) {
    const target = path.resolve(root, name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }

  it('主包页面缺少 JSON 时失败，不能把类报告当作页面配置', async () => {
    await file('app.json', '{"pages":["pages/home"]}')
    await file('pages/home.wxml.json', '{}')
    await expect(readTemplatePageConfigs(root)).rejects.toMatchObject({ code: 'ENOENT', path: path.join(root, 'pages/home.json') })
  })

  it.each(['subPackages', 'subpackages'])('检查 %s 注册的独立分包页面，包括 root 尾斜线', async (key) => {
    await file('app.json', JSON.stringify({ pages: ['home'], [key]: [{ root: 'pkg/', pages: ['detail/index'], independent: true }] }))
    await file('home.json', '{}')
    await expect(readTemplatePageConfigs(root)).rejects.toMatchObject({ code: 'ENOENT', path: path.join(root, 'pkg/detail/index.json') })
    await file('pkg/detail/index.json', '{}')
    expect((await readTemplatePageConfigs(root)).map(item => item.route)).toEqual(['home', 'pkg/detail/index'])
  })

  it('只检查注册页面，保留 component:true 与组件引用，不扫描无关组件', async () => {
    await file('app.json', '{"pages":["home","home"]}')
    await file('home.json', '{"component":true,"usingComponents":{"card":"/components/card"}}')
    await file('components/unregistered.wxml', '<view/>')
    expect(await readTemplatePageConfigs(root)).toEqual([{
      route: 'home',
      file: path.join(root, 'home.json'),
      config: { component: true, usingComponents: { card: '/components/card' } },
    }])
  })

  it.each(['null', '[]', 'invalid'])('注册页面的配置必须是对象：%s', async (content) => {
    await file('app.json', '{"pages":["home"]}')
    await file('home.json', content)
    await expect(readTemplatePageConfigs(root)).rejects.toThrow()
  })
})

it.each([
  { paths: path.posix, root: '/project/dist' },
  { paths: path.posix, root: '/' },
  { paths: path.posix, root: 'relative/dist' },
  { paths: path.win32, root: 'C:\\project\\dist' },
  { paths: path.win32, root: 'C:\\' },
  { paths: path.win32, root: 'relative\\dist' },
])('用当前文件系统路径解析页面：$root', ({ paths, root }) => {
  expect(resolveTemplatePageConfigFile(root, 'pages/home', paths)).toBe(paths.resolve(root, 'pages', 'home.json'))
})

it.each(['', '../outside', '/absolute', 'pages/../outside', 'pages//home', 'pages\\home', 'C:/outside'])('拒绝非小程序路由：%s', (route) => {
  expect(() => resolveTemplatePageConfigFile('/project/dist', route)).toThrow('页面路由无效')
  expect(() => resolveTemplatePageConfigFile('C:\\project\\dist', route, path.win32)).toThrow('页面路由无效')
})
