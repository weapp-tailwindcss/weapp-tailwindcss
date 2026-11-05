import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeUniComponentIds } from './skyline-typography/snapshot'

const demoRequire = createRequire(new URL('../demo/uni-app-vite-tailwindcss-v4/package.json', import.meta.url))
const { hash } = demoRequire('@dcloudio/uni-cli-shared')
const source = ['fixtures', 'skyline-typography', 'components', 'SkylineTypographyProbe.vue']
const paths = [
  { file: path.posix.join('/home/runner/work/project', ...source), moduleId: '/home/runner/work/project/fixtures/skyline-typography/components/SkylineTypographyProbe.vue' },
  { file: path.posix.join('/Users/developer/other-checkout', ...source), moduleId: '/Users/developer/other-checkout/fixtures/skyline-typography/components/SkylineTypographyProbe.vue' },
  { file: path.posix.join('/', ...source), moduleId: '/fixtures/skyline-typography/components/SkylineTypographyProbe.vue' },
  { file: path.posix.join('/Users/literal\\name', ...source), moduleId: '/Users/literal\\name/fixtures/skyline-typography/components/SkylineTypographyProbe.vue' },
  { file: path.win32.join('C:\\checkout', ...source), moduleId: 'C:/checkout/fixtures/skyline-typography/components/SkylineTypographyProbe.vue' },
  { file: path.win32.join('D:\\', ...source), moduleId: 'D:/fixtures/skyline-typography/components/SkylineTypographyProbe.vue' },
]
const files = paths.map(({ file }) => file)
const wxml = (file: string, suffix = '-0') => `<probe u-i="${hash(paths.find(entry => entry.file === file)!.moduleId)}${suffix}" style="--tw-leading:;"/>`

describe('Skyline 静态快照的源码身份边界', () => {
  it.each(files)('校验绝对源码身份后消除宿主根目录差异：%s', (file) => {
    expect(normalizeUniComponentIds(wxml(file), file, 1)).toBe('<probe u-i="__SOURCE__-0" style="--tw-leading:;"/>')
  })

  it('保留组件顺序、父链和非身份属性', () => {
    const file = files[0]!
    const input = `${wxml(file, '-0,parent-2')}<other u-i="${hash(paths[0]!.moduleId)}-1" data-u-i="literal"/>`
    expect(normalizeUniComponentIds(input, file, 2)).toBe('<probe u-i="__SOURCE__-0,parent-2" style="--tw-leading:;"/><other u-i="__SOURCE__-1" data-u-i="literal"/>')
  })

  it('拒绝其它源码的身份', () => {
    expect(() => normalizeUniComponentIds(wxml(files[0]!), files[1]!, 1)).toThrow('组件身份与源码或顺序不符')
  })

  it('相同哈希出现在其它属性和正文时保持逐字不变', () => {
    const prefix = hash(paths[0]!.moduleId)
    const input = `<view data-u-i="${prefix}-0">${prefix}<probe u-i="${prefix}-0"/></view>`
    expect(normalizeUniComponentIds(input, files[0]!, 1)).toBe(`<view data-u-i="${prefix}-0">${prefix}<probe u-i="__SOURCE__-0"/></view>`)
  })

  it.each(['-1', '-0x', '-0-1'])('拒绝错误组件序号：%s', (suffix) => {
    expect(() => normalizeUniComponentIds(wxml(files[0]!, suffix), files[0]!, 1)).toThrow('组件身份与源码或顺序不符')
  })

  it('拒绝缺失、额外或重复的身份属性', () => {
    const file = files[0]!
    expect(() => normalizeUniComponentIds('<probe data-u-i="literal"/>', file, 1)).toThrow('组件身份数量不符')
    expect(() => normalizeUniComponentIds(wxml(file), file, 0)).toThrow('组件身份数量不符')
    expect(() => normalizeUniComponentIds(wxml(file).repeat(2), file, 2)).toThrow('组件身份与源码或顺序不符')
  })

  it('拒绝相对源码路径', () => {
    expect(() => normalizeUniComponentIds('', path.join(...source), 0)).toThrow('必须使用绝对源码路径')
  })
})
