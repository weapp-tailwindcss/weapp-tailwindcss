import type { HmrContext, Plugin } from 'vite'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it, vi } from 'vitest'
import { resolveConfig } from 'vite5'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { pluginSlots } from '@/bundlers/vite/frameworks/uni-app/plugin-descriptors'
import { createUniAppSkylineTypography, skylineTypographyPluginName } from '@/bundlers/vite/frameworks/uni-app/skyline-typography'
import { resolveSfcStyleRequestFromKnownSource } from '@/bundlers/vite/generate-bundle/sfc-style-source'
import { bindVitePluginSlots } from '@/bundlers/vite/shared/plugin-slots'

const RESET = 'view,text{--tw-leading:var(--weapp-tw-invalid-reset);--tw-font-weight:var(--weapp-tw-invalid-reset)}'

function fixture(root = '/project', watch = false) {
  let reset: string | undefined = RESET
  const feature = createUniAppSkylineTypography({
    getResolvedConfig: () => ({ root, command: 'build', build: { outDir: 'dist', watch } }),
    getSkylineTypographyResetCss: () => reset,
    isEnabled: () => true,
  })
  return { ...feature, setReset: (value: string | undefined) => { reset = value } }
}

function call(plugin: Plugin, name: keyof Plugin, ...args: unknown[]) {
  const hook = plugin[name] as any
  return (typeof hook === 'function' ? hook : hook?.handler)?.apply({}, args)
}

describe('uni-app Skyline 组件初始化', () => {
  it.each([
    '<template><text>两行文字</text></template>',
    '<template><view /></template><style scoped>.label{line-height:var(--tw-leading,32px)}</style>',
    '<template><view /></template><style>text{--tw-leading:38px!important}</style>',
    '<template><view /></template><style src="./typography.scss" lang="scss"></style>',
  ])('独立首块覆盖没有样式、scoped、作者 setter 和外部样式：%s', (source) => {
    const feature = fixture()
    const prepared = feature.normalizeSfcSource(source, '/project/components/Label.vue')
    const before = parse(source).descriptor
    const after = parse(prepared).descriptor
    expect(prepared.endsWith(source)).toBe(true)
    expect(after.styles).toHaveLength(before.styles.length + 1)
    expect(after.styles[0]).toMatchObject({ content: `\n${RESET}\n`, attrs: { 'weapp-skyline-typography': true } })
    expect(after.styles[0]?.scoped).toBeUndefined()
    expect(after.styles.slice(1).map(style => ({ content: style.content, attrs: style.attrs })))
      .toEqual(before.styles.map(style => ({ content: style.content, attrs: style.attrs })))
    expect(feature.normalizeSfcSource(prepared, '/project/components/Label.vue')).toBe(prepared)
  })

  it('保持 CSS preflight 关闭时的窄初始化和自定义 selector', () => {
    const feature = fixture()
    feature.setReset('view,text,button{--tw-leading:var(--reserved);--tw-font-weight:var(--reserved)}')
    const prepared = feature.normalizeSfcSource('<template><button /></template>', '/project/Action.vue')
    expect(prepared).toContain('view,text,button{')
    expect(prepared).not.toMatch(/border|margin|padding/)
  })

  it.each([
    '/project/Label.vue?vue&type=style&index=0',
    '/project/Label.vue?vue&type=template',
    '/project/Label.uvue',
    '/project/Label.nvue',
    '/project/node_modules/dependency/Label.vue',
    '/project-other/Label.vue',
    '\0virtual:Label.vue',
  ])('跳过非本地普通 Vue 主模块：%s', (id) => {
    const feature = fixture()
    const source = '<template><text /></template>'
    expect(feature.normalizeSfcSource(source, id)).toBe(source)
  })

  it.each([
    ['/project', '/project/Label.vue'],
    ['C:\\project', 'C:\\project\\Label.vue'],
    ['C:\\project', '.\\components\\Label.vue'],
    ['\\\\server\\share\\project', '\\\\server\\share\\project\\Label.vue'],
    ['/', '/Label.vue'],
  ])('按原生路径能力识别本地模块：%s / %s', (root, id) => {
    expect(fixture(root).normalizeSfcSource('<template />', id)).toContain(RESET)
  })

  it.each([
    ['C:\\project', 'D:\\project\\Label.vue'],
    ['C:\\project', '..\\outside\\Label.vue'],
    ['C:\\project', 'C:\\project\\node_modules\\dep\\Label.vue'],
  ])('排除不同盘符、父目录与依赖目录：%s / %s', (root, id) => {
    expect(fixture(root).normalizeSfcSource('<template />', id)).toBe('<template />')
  })

  it('关闭开关会撤销已认证的本轮生成块，不改动作者的 marker 样式', () => {
    const feature = fixture()
    const author = '<style weapp-skyline-typography>text{--tw-leading:38px}</style>'
    const prepared = feature.normalizeSfcSource(author, '/project/Label.vue')
    feature.setReset(undefined)
    expect(feature.normalizeSfcSource(prepared, '/project/Label.vue')).toBe(author)
    expect(feature.normalizeSfcSource(author, '/project/Other.vue')).toBe(author)
  })

  it('HMR 在 Vue 描述符比较前准备相同块和 style 索引', async () => {
    const feature = fixture()
    const source = '<template><text /></template><style scoped>text{--tw-leading:38px}</style>'
    const context = { file: '/project/Label.vue', read: vi.fn(async () => source) } as unknown as HmrContext
    await call(feature.plugin, 'handleHotUpdate', context)
    const prepared = await context.read()
    expect(prepared).toBe(feature.normalizeSfcSource(source, context.file))
    expect(parse(prepared).descriptor.styles[1]?.scoped).toBe(true)
    expect(call(feature.plugin, 'transform', prepared, context.file)).toBeUndefined()
  })

  it('模块较多与已准备源码更新时，归属不随源码缓存淘汰或重复注入', () => {
    const feature = fixture()
    const source = '<template><text /></template>'
    const prepared = feature.normalizeSfcSource(source, '/project/Label.vue')
    for (let i = 0; i < 256; i++) {
      feature.normalizeSfcSource(source, `/project/Other${i}.vue`)
    }
    expect(feature.normalizeSfcSource(prepared, '/project/Label.vue')).toBe(prepared)
    const edited = `${prepared}<style>text{--tw-leading:38px}</style>`
    const normalized = feature.normalizeSfcSource(edited, '/project/Label.vue')
    expect(parse(normalized).descriptor.styles).toHaveLength(2)
    feature.setReset(undefined)
    expect(feature.normalizeSfcSource(normalized, '/project/Label.vue')).toBe(`${source}<style>text{--tw-leading:38px}</style>`)
  })

  it('更新 selector 时替换已登记的初始化而保留作者 marker 块', () => {
    const feature = fixture()
    const author = `<style weapp-skyline-typography>\n${RESET}\n</style>\n<template />`
    const prepared = feature.normalizeSfcSource(author, '/project/Label.vue')
    feature.setReset(RESET.replace('view,text', 'view,text,button'))
    const updated = feature.normalizeSfcSource(prepared, '/project/Label.vue')
    expect(parse(updated).descriptor.styles).toHaveLength(2)
    expect(updated.endsWith(author)).toBe(true)
    feature.setReset(undefined)
    expect(feature.normalizeSfcSource(updated, '/project/Label.vue')).toBe(author)
  })

  it('扫描源码与已转换缓存都使用相同索引，并保持 remembered source 归属', async () => {
    const feature = fixture()
    const file = '/project/Label.vue'
    const author = '<template><text /></template><style scoped>text{--tw-leading:38px}</style>'
    const candidates = new Map([[file, author]])
    const memory = createViteCssMemory({
      debug: vi.fn(),
      getSourceCandidateSource: id => candidates.get(id),
      normalizeSfcSource: feature.normalizeSfcSource,
    })
    const prepared = feature.normalizeSfcSource(author, file)
    memory.rememberKnownSfcSource(file, prepared)
    const request = resolveSfcStyleRequestFromKnownSource(file, memory.getKnownSfcSource(file), 'text{--tw-leading:38px}')
    expect(request).toContain('index=1&scoped=true')
    memory.rememberCssSource({ outputFile: 'components/Label.wxss', rawSource: '.old{}', sourceFile: request })
    await memory.refreshRememberedCssSourceByCurrentFile(file)
    expect(memory.getRememberedCssSourceEntry('components/Label.wxss')).toMatchObject({ sourceFile: request, rawSource: 'text{--tw-leading:38px}' })
    candidates.clear()
    expect(memory.getKnownSfcSource(file)).toBe(prepared)
    memory.removeSource(file)
    expect(memory.getKnownSfcSource(file)).toBeUndefined()
  })

  it('扫描发现的无 style 组件同样可以还原初始化来源', () => {
    const feature = fixture()
    const memory = createViteCssMemory({
      debug: vi.fn(),
      getSourceCandidateSource: () => '<template><text /></template>',
      normalizeSfcSource: feature.normalizeSfcSource,
    })
    expect(memory.getKnownSfcSource('/project/Label.vue')).toContain(RESET)
  })

  it('watch 轮次保留初始化身份，删除后不会借用旧来源', () => {
    const feature = fixture('/project', true)
    const source = '<template><text /></template>'
    const prepared = feature.normalizeSfcSource(source, '/project/Label.vue')
    call(feature.plugin, 'closeBundle')
    feature.setReset(undefined)
    expect(feature.normalizeSfcSource(prepared, '/project/Label.vue')).toBe(source)
    feature.setReset(RESET)
    feature.normalizeSfcSource(source, '/project/Label.vue')
    call(feature.plugin, 'watchChange', '/project/Label.vue', { event: 'delete' })
    feature.setReset(undefined)
    expect(feature.normalizeSfcSource('<template><view /></template>', '/project/Label.vue')).toBe('<template><view /></template>')
  })

  it('静态槽位和运行时 hook 元数据一致，并位于 source candidate 之前', () => {
    const feature = fixture()
    const index = pluginSlots.findIndex(slot => slot.name === skylineTypographyPluginName)
    const slot = pluginSlots[index]!
    expect(index).toBeLessThan(pluginSlots.findIndex(entry => entry.name.endsWith(':source-candidates')))
    expect(() => bindVitePluginSlots([slot], [feature.plugin])).not.toThrow()
  })

  it('Vite 5 中先于用户数组前方的 uni pre-vue 普通 transform 运行', async () => {
    const feature = fixture()
    const uni: Plugin = { name: 'uni:pre-vue', enforce: 'pre', transform: source => source }
    const config = await resolveConfig({ configFile: false, logLevel: 'silent', plugins: [uni as any, feature.plugin as any] }, 'build')
    const sorted = (config as unknown as { getSortedPlugins: (hook: string) => Plugin[] }).getSortedPlugins('transform')
    expect(sorted.indexOf(feature.plugin)).toBeLessThan(sorted.indexOf(uni))
  })
})
