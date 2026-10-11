import type { Plugin, ResolvedConfig } from 'vite'
import { createStyleHandler, postcss } from '@weapp-tailwindcss/postcss'
import { createJsHandler } from '@/js'
import { createUniAppXBorderPreflight, hoistUniAppXBorderPreflight } from '@/uni-app-x/border-preflight'
import { transformUVue } from '@/uni-app-x/transform'
import { createUniAppXPlugins } from '@/uni-app-x/vite'

const reset = '.weapp-tw-border { border-width: 0; }'
const jsHandler = createJsHandler({})

describe('issue 1160 component border preflight', () => {
  it.each([3, 4])('retains the shared reset and utility declarations through Tailwind v%s native compatibility', async (majorVersion) => {
    const handler = createStyleHandler({ majorVersion, appType: 'uni-app-x', uniAppX: true, uniAppXCssTarget: 'uvue' })
    const source = `view,text{border-width:0;--tw-border-style:solid}${reset}.top{border-top-width:1px}.left{border-left-width:2px}.all{border-width:2px}.zero{border-top-width:0}.solid{border-style:solid}.dashed{border-style:dashed}.none{border-style:none}`
    const result = await handler(source)
    const rules: Record<string, Record<string, string>> = {}
    postcss.parse(result.css).walkRules((rule) => {
      rules[rule.selector] = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]))
    })
    expect(rules['view,text']).toBeUndefined()
    expect(rules['.weapp-tw-border']).toEqual({ 'border-width': '0' })
    expect(rules['.top']).toEqual({ 'border-top-width': '1px' })
    expect(rules['.left']).toEqual({ 'border-left-width': '2px' })
    expect(rules['.all']).toEqual({ 'border-width': '2px' })
    expect(rules['.zero']).toEqual({ 'border-top-width': '0' })
    for (const style of ['solid', 'dashed', 'none']) {
      expect(rules[`.${style}`]).toEqual({ 'border-style': style })
    }
  })

  it('restores base priority after component CSS replay without crossing imports', () => {
    const source = `@import "./theme.wxss";@media (min-width:1px){.custom{border-width:3px}}.native{border-top-width:1px}.apply{border-top-width:1px}${reset}.pair{border-left-width:2px}`
    const output = hoistUniAppXBorderPreflight(source)
    const root = postcss.parse(output)
    expect(root.nodes.map(node => node.type === 'rule' ? node.selector : node.type === 'atrule' ? node.name : node.type)).toEqual(['import', '.weapp-tw-border', 'media', '.native', '.apply', '.pair'])
    expect(hoistUniAppXBorderPreflight(output)).toBe(output)
    expect(hoistUniAppXBorderPreflight('.custom{border-width:3px}')).toBe('.custom{border-width:3px}')
  })
  it.each(['web', 'mini', 'native'])('routes configured preflight for the %s target', async (target) => {
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      cssPreflight: { 'border-width': '0' },
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: () => true,
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler: vi.fn(),
      jsHandler,
      ensureRuntimeClassSet: async () => new Set(),
      getResolvedConfig: () => ({ root: '/project', command: 'build', build: { outDir: target === 'native' ? 'dist/app-android' : 'dist' } } as ResolvedConfig),
      isWebGeneratorTarget: () => target === 'web',
      uniAppX: { enabled: true, componentLocalStyles: false },
    })
    const plugin = plugins.find(item => item.name === 'weapp-tailwindcss:uni-app-x:nvue')!
    const transform = plugin.transform as Exclude<Plugin['transform'], Function | undefined>
    const result = await (transform as { handler: Function }).handler.call({}, '<template><view class="border-solid" /></template>', '/project/Probe.uvue')
    expect(result.code.includes('weapp-tw-border')).toBe(target !== 'web')
  })

  it('places a shared reset before author styles without resetting each utility', () => {
    const source = '<template><view class="border-t-[1px] border-l-[2px] border-solid"><text :class="color">1</text></view></template><style>.custom{border-left-width:3px}</style>'
    const result = transformUVue(source, 'component.uvue', jsHandler, new Set(), {
      borderPreflight: reset,
    })!
    expect(result.code).toContain('class="weapp-tw-border border-t-_b1px_B border-l-_b2px_B border-solid"')
    expect(result.code).toContain('<text class="weapp-tw-border" :class="color">')
    expect(result.code!.indexOf(reset)).toBeLessThan(result.code!.indexOf('.custom{'))
    expect(result.code!.match(/border-width: 0/g)).toHaveLength(1)
  })

  it('uses only configured border defaults and honors disabling', () => {
    expect(createUniAppXBorderPreflight(false)).toBeUndefined()
    expect(createUniAppXBorderPreflight()).toBeUndefined()
    expect(createUniAppXBorderPreflight({ border: false, 'border-width': false, padding: '0' })).toBeUndefined()
    const parsed = postcss.parse(createUniAppXBorderPreflight({ border: false, 'border-width': '0', padding: '0' })!)
    expect(parsed.nodes).toHaveLength(1)
    expect(parsed.first).toMatchObject({ selector: '.weapp-tw-border', nodes: [{ prop: 'border-width', value: '0' }] })
    expect(createUniAppXBorderPreflight({ border: '0 solid', 'border-color': 'red' })).toContain('border: 0 solid;')
  })

  it.each(['class=""', 'class', ':class="flag ? \'border-t-[1px]\' : \'border-b-[1px]\'"'])('supports empty and dynamic classes: %s', (attribute) => {
    const result = transformUVue(`<template><view ${attribute} /></template>`, 'component.uvue', jsHandler, new Set(), {
      borderPreflight: reset,
    })!
    expect(result.code).toMatch(/class="weapp-tw-border\s*"/)
    if (attribute.startsWith(':')) {
      expect(result.code).toContain(':class="flag ?')
    }
  })

  it('keeps native preflight independent of local aliases and handles repeated transforms', () => {
    const options = { native: true, enableComponentLocalStyle: true, borderPreflight: reset }
    const candidates = new Set(['border-t-[1px]', 'border-l-[2px]', 'border-solid'])
    const source = '<template><view class="border-t-[1px] border-l-[2px] border-solid" /></template><style scoped>.custom { @apply border-t-[1px]; }</style>'
    const first = transformUVue(source, '/project/components/Probe.uvue', jsHandler, candidates, options)!.code!
    expect(first).toContain('class="weapp-tw-border wtu-')
    expect(first).toContain('@apply border-t-[1px];')
    expect(first.match(/border-width: 0/g)).toHaveLength(1)
    const second = transformUVue(first, '/project/components/Probe.uvue', jsHandler, candidates, options)!.code!
    expect(second).toBe(first)
  })

  it('uses the default view/text range and supports the explicit all range', () => {
    const source = '<template><scroll-view><view /><text /><button /><slot /><template v-if="flag"><view /></template></scroll-view></template>'
    const run = (range?: 'all') => transformUVue(source, 'page.uvue', jsHandler, new Set(), {
      borderPreflight: reset,
      borderPreflightRange: range,
    })!.code!
    expect(run()).not.toContain('<button class=')
    expect(run('all')).toContain('<button class="weapp-tw-border"')
    expect(run('all')).not.toContain('<slot class=')
    expect(run('all')).not.toContain('<template class=')
  })

  it('leaves targets without native preflight unchanged', () => {
    const source = '<template><view class="border-solid" /></template>'
    expect(transformUVue(source, 'page.uvue', jsHandler, new Set())!.code).toBe(source)
    expect(transformUVue(source, 'page.vue', jsHandler, new Set(), { borderPreflight: reset })).toBeUndefined()
  })
})
