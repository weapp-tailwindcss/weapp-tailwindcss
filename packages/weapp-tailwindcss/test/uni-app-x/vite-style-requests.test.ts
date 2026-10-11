import type { Plugin, ResolvedConfig } from 'vite'
import { postcss } from '@weapp-tailwindcss/postcss'
import { expect, it, vi } from 'vitest'
import { createJsHandler } from '@/js'
import { createUniAppXPlugins } from '@/uni-app-x/vite'

function hook(plugin: Plugin, name: 'load' | 'transform' | 'handleHotUpdate') {
  const value = plugin[name] as any
  return typeof value === 'object' ? value.handler : value
}

it.each([
  '/project/Probe.uvue',
  'C:\\project\\Probe.uvue',
  'C:/project/Probe.uvue',
  'C:\\工作目录 with spaces\\components\\Probe.uvue',
  '\\\\server\\share\\components\\Probe.uvue',
  'D:\\Probe.uvue',
  '/Probe.uvue',
  'components/Probe.uvue',
])('keeps generated Web style requests owned by their SFC: %s', async (id) => {
  const plugins = createUniAppXPlugins({
    appType: 'uni-app-x',
    customAttributesEntities: [],
    disabledDefaultTemplateHandler: false,
    mainCssChunkMatcher: vi.fn(() => true),
    runtimeState: { readyPromise: Promise.resolve() },
    styleHandler: async code => await postcss().process(code, { from: undefined, map: { inline: false } }),
    jsHandler: createJsHandler({}),
    ensureRuntimeClassSet: async () => new Set(['h-8', 'h-12']),
    getResolvedConfig: () => ({ command: 'serve', root: '/project' } as ResolvedConfig),
    isWebGeneratorTarget: () => true,
    uniAppX: {
      enabled: true,
      componentLocalStyles: { enabled: true, onlyWhenStyleIsolationVersion2: false, componentMatcher: () => true },
    },
  })
  const sfc = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue')!
  const css = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css:pre')!
  const styleId = `${id}?vue&type=style&index=1&scoped=probe&lang.css`
  for (const utility of ['h-8', 'h-12', 'h-8']) {
    const source = `<template><view class="${utility}" /></template><style>.author { color: red; }</style>`
    const output = await hook(sfc, 'transform').call(sfc, source, id)
    expect(output.code).toContain(`@apply ${utility};`)
    const ctx = {
      file: id,
      read: async () => source,
      modules: [],
      server: { config: { root: '/project' }, moduleGraph: { getModulesByFile: () => new Set() } },
    }
    await hook(css, 'handleHotUpdate').call(css, ctx)
    // 模拟框架在普通 HMR hook 中补 scoped；Vue 必须看到主转换追加的块。
    const read = ctx.read
    ctx.read = async () => (await read()).replace('<style>', '<style scoped>')
    expect((await ctx.read()).match(/<style\b/g)).toHaveLength(2)
    await hook(sfc, 'handleHotUpdate').call(sfc, ctx)
    expect((await hook(css, 'load').call(css, styleId)).code).toContain(`@apply ${utility};`)
    // 框架可能为不存在于原始描述符中的生成块返回完整 SFC。
    expect(await hook(sfc, 'transform').call(sfc, source, styleId)).toBeUndefined()
    // HBuilderX 在主模块之后请求独立 UTS 脚本；它不能清空同文件的样式来源。
    for (const [query, payload] of [
      ['type=script&lang.uts', 'export default { data() { return {} } }'],
      ['type=script&setup=true&lang.uts', 'export default defineComponent({})'],
      ['type=template', '<template><view class="h-12" /></template>'],
      ['type=custom&index=0', '{}'],
    ]) {
      expect(await hook(sfc, 'transform').call(sfc, payload, `${id}?vue&${query}`)).toBeUndefined()
    }
    const loaded = await hook(css, 'load').call(css, styleId)
    expect(loaded.code).toContain(`@apply ${utility};`)
    expect(loaded.code).not.toContain('<template>')
    expect(loaded.code).not.toContain(`@apply ${utility === 'h-8' ? 'h-12' : 'h-8'};`)
    // uni:css-scoped 在 handleHotUpdate 中给作者块补 scoped，生成块暂时消失。
    await hook(sfc, 'transform').call(sfc, source.replace('<style>', '<style scoped>'), id)
    expect(await hook(css, 'load').call(css, styleId)).toEqual({ code: '', map: null })
    expect(await hook(css, 'transform').call(css, source, styleId)).toEqual({ code: '', map: null })
    const authored = await hook(css, 'transform').call(css, '.author { color: red; }', `${id}?vue&type=style&index=0&lang.css`)
    expect(authored.code).toContain(`@apply ${utility};`)
    await hook(sfc, 'transform').call(sfc, source, id)
    const alias = output.code.match(/class="([^"]+)"/)![1]
    expect(loaded.code).toContain(`.${alias}`)
    const transformed = await hook(css, 'transform').call(css, source, styleId)
    expect(transformed.code).toContain(`@apply ${utility};`)
    expect(transformed.code).toContain(`.${alias}`)
    expect(transformed.code).not.toContain('<template>')
  }
  await hook(sfc, 'transform').call(sfc, '<template><view /></template><style>.author { color: red; }</style>', id)
  expect(await hook(css, 'load').call(css, styleId)).toEqual({ code: '', map: null })
  const retired = await hook(css, 'transform').call(css, '<template><view>{{ theme }}</view></template><style>.author { color: red; }</style>', styleId)
  expect(retired).toEqual({ code: '', map: null })
  // 后续作者块复用旧索引时，空块记录不能覆盖真实作者 CSS。
  const authoredSource = '<template><view /></template><style>.first { color: red; }</style><style>.second { color: blue; }</style>'
  await hook(sfc, 'transform').call(sfc, authoredSource, id)
  expect(await hook(css, 'load').call(css, styleId)).toBeUndefined()
  expect(await hook(css, 'transform').call(css, authoredSource, styleId)).toEqual({ code: '.second { color: blue; }', map: null })
  expect(await hook(css, 'load').call(css, `${id}?vue&type=style&index=99&lang.css`)).toBeUndefined()
})
