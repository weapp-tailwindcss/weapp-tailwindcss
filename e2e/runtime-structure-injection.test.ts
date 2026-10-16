import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { uniAppAppCases, uniAppXAppCases } from './hbuilderx-local/cases'
import { readRuntimeStructureSample } from './hbuilderx-local/runtime-structure'
import { injectRuntimeStructureProbe } from './hbuilderx-local/runtime-structure/inject'
import { parseRuntimeProbeSource } from './hbuilderx-local/runtime-structure/source'

function script(source: string, renderjs = false) {
  return [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].find(match => /renderjs/.test(match[1]!) === renderjs)![2]!
}

function evaluate(body: string, globals: Record<string, unknown>) {
  const exports: { default?: Record<string, any> } = {}
  const result = ts.transpileModule(body, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  runInNewContext(result.outputText, { exports, ...globals })
  return exports.default!
}

function element(text = '真实设备文字') {
  const marker = {
    id: 'native-hmr-probe',
    tagName: 'VIEW',
    textContent: text,
    parentElement: null as unknown,
    getAttribute: (name: string) => name === 'id' ? marker.id : name === 'data-wt-runtime-token' ? 'actual-render-token' : null,
    getBoundingClientRect: () => ({ left: 12, top: 45, width: 173, height: 41 }),
    querySelectorAll: (_selector: string): unknown[] => [],
  }
  return marker
}

describe('运行时结构源码适配', () => {
  it.each(['uni-app-renderjs', 'uni-app-x-element'] as const)('纯模板页面允许添加%s所需的逻辑脚本', (adapter) => {
    const generated = injectRuntimeStructureProbe('<template><view>original</view></template>', 'current-run', adapter)
    const descriptor = parseRuntimeProbeSource(generated)
    expect(descriptor.script).not.toBeNull()
    if (adapter === 'uni-app-renderjs') {
      expect(() => compileScript(descriptor, { id: 'runtime-probe' })).not.toThrow()
      expect(generated).toContain('methods: { __wtRuntimeReport')
    }
    else {
      const mounted = vi.fn()
      const options = evaluate(script(generated), { require: () => ({ onMounted: mounted, onUnmounted: vi.fn() }) })
      options.setup()
      expect(mounted).toHaveBeenCalledOnce()
      expect(descriptor.script!.lang).toBe('uts')
    }
  })

  it('UniX Options保留生命周期、业务方法、setup返回值；只有挂载后才读UniElement', () => {
    const source = `<template><view/></template><script lang="uts">export default {
      setup() { return { business: 42 } }, mounted() { businessMounted() }, unmounted() { businessUnmounted() },
      methods: { original() { return 'kept' } }
    }</script>`
    const generated = injectRuntimeStructureProbe(source, 'current-run', 'uni-app-x-element')
    const hooks = { mounted: [] as Array<() => void>, unmounted: [] as Array<() => void> }
    let tick!: () => void
    const clear = vi.fn()
    const logs: string[] = []
    const marker = element()
    const text = { ...element(), tagName: 'TEXT', value: '真实设备文字' }
    const root = { getAttribute: () => '', querySelectorAll: () => [marker] }
    marker.parentElement = root
    marker.querySelectorAll = () => [text]
    const getElement = vi.fn(() => marker)
    const options = evaluate(script(generated), {
      require: () => ({ onMounted: (callback: () => void) => hooks.mounted.push(callback), onUnmounted: (callback: () => void) => hooks.unmounted.push(callback) }),
      setInterval: (callback: () => void) => {
        tick = callback
        return 7
      },
      clearInterval: clear,
      uni: { getElementById: getElement, getWindowInfo: () => ({ pixelRatio: 3 }) },
      console: { log: (value: string) => logs.push(value) },
    })
    expect(options.setup()).toEqual({ business: 42 })
    expect(getElement).not.toHaveBeenCalled()
    expect(options.methods.original()).toBe('kept')
    hooks.mounted[0]!()
    tick()
    text.value = '下一步真实文字'
    tick()
    const sample = readRuntimeStructureSample(logs[1]!, 'current-run')!
    expect(sample).toMatchObject({ sequence: 2, token: 'actual-render-token', markerCount: 1, marker: { id: marker.id, text: text.value, rect: marker.getBoundingClientRect() } })
    marker.querySelectorAll = () => null as unknown as unknown[]
    root.querySelectorAll = () => null as unknown as typeof marker[]
    tick()
    expect(readRuntimeStructureSample(logs[2]!, 'current-run')).toMatchObject({ markerCount: 0, marker: { text: '' } })
    hooks.unmounted[0]!()
    expect(clear).toHaveBeenCalledWith(7)
    expect(generated).toContain('mounted() { businessMounted() }')
    expect(generated).toContain('unmounted() { businessUnmounted() }')
  })

  it('普通uni-app从renderjs真实DOM桥接，重复ID原样报告，根移除或pagehide释放定时器', () => {
    const source = '<template><view><text>Hello</text></view></template><script>export default { mounted() { originalMounted() }, methods: { original() { return 42 } } }</script>'
    const generated = injectRuntimeStructureProbe(source, 'current-run', 'uni-app-renderjs')
    let tick!: () => void
    const clear = vi.fn()
    const add = vi.fn()
    const remove = vi.fn()
    const marker = element()
    const root = { isConnected: true }
    const owner = { callMethod: vi.fn() }
    const document = { querySelector: vi.fn(() => root), querySelectorAll: () => [marker, marker] }
    const options = evaluate(script(generated, true), {
      document,
      window: { devicePixelRatio: 3, addEventListener: add, removeEventListener: remove },
      setInterval: (callback: () => void) => {
        tick = callback
        return 9
      },
      clearInterval: clear,
    })
    const component = { ...options.methods }
    component.start('current-run', undefined, owner)
    tick()
    const payload = JSON.parse(owner.callMethod.mock.calls[0]![1])
    expect(payload).toMatchObject({ token: 'actual-render-token', markerCount: 2, marker: { text: marker.textContent, rect: marker.getBoundingClientRect() } })
    marker.textContent = 'after actual DOM mutation'
    tick()
    expect(JSON.parse(owner.callMethod.mock.calls[1]![1]).marker.text).toBe(marker.textContent)
    root.isConnected = false
    tick()
    expect(clear).toHaveBeenCalledWith(9)
    expect(remove).toHaveBeenCalledWith('pagehide', expect.any(Function))
    component.start('current-run', undefined, owner)
    add.mock.calls.at(-1)![1]()
    expect(clear).toHaveBeenCalledTimes(3)
    const logs: string[] = []
    const service = evaluate(script(generated), { console: { log: (value: string) => logs.push(value) } })
    expect(service.methods.original()).toBe(42)
    service.methods.__wtRuntimeReport(JSON.stringify(payload))
    expect(readRuntimeStructureSample(logs[0]!, 'current-run')).toEqual(payload)
    expect(generated).toContain('mounted() { originalMounted() }')
  })

  it('script setup页面的桥接在独立normal script，原setup保持不变', () => {
    const original = 'const business = 42\n'
    const generated = injectRuntimeStructureProbe(`<template><view/></template><script setup lang="ts">${original}</script>`, 'current-run', 'uni-app-renderjs')
    expect(generated).toContain(`<script setup lang="ts">${original}</script>`)
    expect(generated).toContain('<script lang="ts">export default { methods: { __wtRuntimeReport')
    expect(() => compileScript(parseRuntimeProbeSource(generated), { id: 'runtime-probe' })).not.toThrow()
  })

  it('脚本setup的UniX走同一生命周期，不生成Options桥接', () => {
    const generated = injectRuntimeStructureProbe('<template><view/></template><script setup lang="uts">const value = 42</script>', 'current-run', 'uni-app-x-element')
    expect(generated).toContain('const value = 42\n__wtInstallRuntimeStructure()')
    expect(generated).not.toContain('export default')
  })

  it('模板注释、嵌套template、属性中的大于号与script字符串不充当真实view', () => {
    const source = `<template><!-- <view>fake</view> --><template v-if="true"><view title="a > b">actual</view></template></template>
      <script>const fake = '<view>script</view>'; export default {}</script>`
    const generated = injectRuntimeStructureProbe(source, 'current-run', 'uni-app-renderjs')
    expect(generated).toContain('<!-- <view>fake</view> -->')
    expect(generated).toContain('const fake = \'<view>script</view>\'')
    expect(generated).toMatch(/<view data-wt-runtime-owner='current-run'[^>]+title="a > b">actual/)
    expect(() => injectRuntimeStructureProbe(`<template><text>no view</text></template><script>const fake = '<view>'; export default {}</script>`, 'current-run', 'uni-app-renderjs')).toThrow('可绑定的 view')
  })

  it('已有renderjs模块不充当逻辑script，也不会被覆盖', () => {
    const module = '<script module="existing" lang="renderjs">export default { methods: { original() {} } }</script>'
    const generated = injectRuntimeStructureProbe(`<template><view/></template>${module}<script>export default {}</script>`, 'current-run', 'uni-app-renderjs')
    expect(generated).toContain(module)
    expect(parseRuntimeProbeSource(generated).script!.content).toContain('__wtRuntimeReport')
  })

  it.each([
    '<script>export default {}</script>',
    '<template><view/></template><script>export default makeOptions()</script>',
    '<template><view/></template><script>export default { methods: existing }</script>',
    '<template><view/></template><script>export default { methods: { __wtRuntimeReport() {} } }</script>',
  ])('无法安全注入时阻断：%s', (source) => {
    expect(() => injectRuntimeStructureProbe(source, 'current-run', 'uni-app-renderjs')).toThrow('运行时结构')
  })

  it('所有当前iOS用例的真实SFC均可生成临时探针，禁止重复安装', async () => {
    for (const item of [...uniAppAppCases, ...uniAppXAppCases].filter(item => item.platform === 'app-ios')) {
      const source = await readFile(resolve(item.projectDir, item.sourceFile), 'utf8')
      const adapter = item.sourceFile.endsWith('.uvue') ? 'uni-app-x-element' : 'uni-app-renderjs'
      const generated = injectRuntimeStructureProbe(source, 'current-run', adapter)
      expect(generated).toContain('WT_RUNTIME_STRUCTURE_current-run=')
      expect(() => injectRuntimeStructureProbe(generated, 'current-run', adapter)).toThrow('重复安装')
    }
  })
})
