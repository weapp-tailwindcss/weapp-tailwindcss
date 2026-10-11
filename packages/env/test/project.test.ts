import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectAppType, detectAppTypeFromEnv, detectAppTypeFromPackageJson } from '../src'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(pkg: unknown = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'framework project '))
  roots.push(root)
  await writeFile(path.join(root, 'package.json'), JSON.stringify(pkg))
  return root
}

describe('项目识别边界', () => {
  it.each(['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'])('读取 %s 的依赖', (field) => {
    expect(detectAppTypeFromPackageJson({ [field]: { '@tarojs/runtime': '*' } })).toBe('taro')
  })

  it.each([
    ['weapp-vite build', 'weapp-vite'],
    ['mpx-cli-service build', 'mpx'],
    ['taro build', 'taro'],
    ['uni build', 'uni-app-vite'],
  ] as const)('保留 script 识别 %s', (script, expected) => {
    expect(detectAppTypeFromPackageJson({ scripts: { build: script } })).toBe(expected)
  })

  it('保持冲突依赖的优先级及未知配置', () => {
    const dependencies = { 'weapp-vite': '*', '@mpxjs/core': '*', '@tarojs/runtime': '*' }
    expect(detectAppTypeFromPackageJson({ dependencies })).toBe('weapp-vite')
    expect(detectAppTypeFromPackageJson({ dependencies: { '@mpxjs/core': '*', '@tarojs/runtime': '*' } })).toBe('mpx')
    expect(detectAppTypeFromPackageJson({ dependencies: { 'vue': '*' } })).toBeUndefined()
  })

  it('按显式 manifest、package、root、env 的顺序识别', async () => {
    const root = await fixture({ dependencies: { '@mpxjs/core': '*' } })
    const options = { root, cwd: root, env: { TARO_ENV: 'weapp' }, packageJson: { dependencies: { 'weapp-vite': '*' } } }
    expect(detectAppType({ ...options, manifest: { 'uni-app-x': {} } })).toBe('uni-app-x')
    expect(detectAppType(options)).toBe('weapp-vite')
    expect(detectAppType({ root, cwd: root, env: options.env })).toBe('mpx')
  })

  it('损坏的 JSON 继续向上查找，searchUp:false 限制在本目录', async () => {
    const root = await fixture({ dependencies: { '@tarojs/runtime': '*' } })
    const nested = path.join(root, 'nested')
    await mkdir(nested)
    await writeFile(path.join(nested, 'package.json'), '{broken')
    await writeFile(path.join(nested, 'manifest.json'), '{broken')
    expect(detectAppType({ root: nested })).toBe('taro')
    expect(detectAppType({ root: nested, searchUp: false })).toBeUndefined()
  })

  it('相对 root 与绝对 root 具有同一身份', async () => {
    const root = await fixture({ dependencies: { 'weapp-vite': '*' } })
    expect(detectAppType({ root: path.relative(process.cwd(), root), searchUp: false })).toBe('weapp-vite')
    expect(detectAppType({ root, searchUp: false })).toBe('weapp-vite')
  })

  it('marker 仅检查初始 root，保持父目录搜索语义', async () => {
    const root = await fixture({ dependencies: { '@tarojs/runtime': '*' } })
    const nested = path.join(root, 'nested')
    await mkdir(nested)
    await writeFile(path.join(root, 'app.mpx'), '')
    expect(detectAppType({ root })).toBe('mpx')
    expect(detectAppType({ root: nested })).toBe('taro')
  })

  it('不存在的目录回退到显式环境，不修改文件系统', async () => {
    const root = await fixture()
    expect(detectAppType({ root: path.join(root, 'missing'), env: { TARO_ENV: 'h5' }, cwd: root })).toBe('taro')
  })

  it('未识别项目上溯到文件系统根后终止', async () => {
    const root = await fixture()
    expect(detectAppType({ root, env: {}, cwd: root })).toBeUndefined()
    expect(detectAppTypeFromEnv({}, { cwd: root })).toBeUndefined()
  })

  it('HBuilderX vite 提示保留显式关闭方式', () => {
    const cwd = '/Applications/HBuilderX.app/Contents/HBuilderX/plugins/uniapp-cli'
    expect(detectAppTypeFromEnv({}, { cwd })).toBe('uni-app-vite')
    expect(detectAppTypeFromEnv({}, { cwd, hbuilderxVite: false })).toBe('uni-app')
  })
})
