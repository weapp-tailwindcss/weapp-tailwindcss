import type { NodeTransform } from '@vue/compiler-dom'
import type { Plugin, ResolvedConfig } from 'vite'
import { compile, ElementTypes, NodeTypes, parse } from '@vue/compiler-dom'
import { describe, expect, it, vi } from 'vitest'
import { createUniAppXCompilerPreflightPlugin } from '@/uni-app-x/vite/compiler-preflight'

type CompilerPluginOptions = Parameters<typeof createUniAppXCompilerPreflightPlugin>[0]

function fixture(options: Partial<CompilerPluginOptions> = {}, originalTransforms: NodeTransform[] = []) {
  const original = { template: { compilerOptions: { nodeTransforms: originalTransforms } }, author: true }
  let current = original
  const api = {
    get options() { return current },
    set options(value) { current = value },
  }
  const vue = { name: 'vite:vue', api } as Plugin
  const plugin = createUniAppXCompilerPreflightPlugin({ isEnabled: () => true, ...options })
  const config = { plugins: [vue] } as unknown as ResolvedConfig
  const invoke = (name: 'configResolved' | 'buildStart' | 'closeBundle' | 'closeWatcher', ...args: any[]) => {
    const hook = plugin[name] as any
    return (typeof hook === 'function' ? hook : hook.handler).call({}, ...args)
  }
  invoke('configResolved', config)
  const run = (source: string, filename = '/project/Probe.uvue') => compile(source, {
    filename,
    mode: 'module',
    nodeTransforms: api.options.template.compilerOptions.nodeTransforms,
  }).code
  return { api, original, originalTransforms, invoke, run }
}

describe('原生模板基础类的编译器边界', () => {
  it.each(['enter', 'exit'] as const)('等待作者 %s 阶段的任意标签映射完成', (phase) => {
    const exits = vi.fn()
    const mapper: NodeTransform = (node) => {
      const map = () => {
        if (node.type === NodeTypes.ELEMENT && node.tag === 'raw-host') {
          node.tag = 'view'
          node.tagType = ElementTypes.ELEMENT
        }
      }
      if (phase === 'enter') {
        map()
      }
      return () => {
        exits()
        if (phase === 'exit') {
          map()
        }
      }
    }
    const f = fixture({}, [mapper])
    const output = f.run('<raw-host class="border-top"/><CustomCard/>')
    expect(output).toContain('class: "weapp-tw-border border-top"')
    expect(output.match(/weapp-tw-border/g)).toHaveLength(1)
    expect(exits).toHaveBeenCalled()
    expect(f.originalTransforms).toEqual([mapper])
    f.invoke('closeBundle')
    expect(f.api.options).toEqual(f.original)
    expect(f.api.options.template.compilerOptions.nodeTransforms).toBe(f.originalTransforms)
  })

  it.each([
    '/project/Probe.uvue',
    'C:\\project\\Probe.uvue',
    'C:/project/Probe.uvue',
    '\\\\server\\share\\Probe.uvue',
    'D:\\Probe.uvue',
    '/Probe.uvue',
    'components/Probe.uvue',
  ])('保留编译器来源身份：%s', (filename) => {
    const f = fixture()
    expect(f.run('<view/>', filename)).toContain('weapp-tw-border')
    f.invoke('closeBundle')
  })

  it('默认仅处理 view/text；all 保持显式扩展范围', () => {
    const source = '<view/><text/><button/><CustomCard/><slot/><template v-if="flag"><view/></template>'
    const normal = fixture()
    expect(normal.run(source).match(/weapp-tw-border/g)).toHaveLength(3)
    const all = fixture({ range: 'all' })
    expect(all.run(source).match(/weapp-tw-border/g)).toHaveLength(5)
    normal.invoke('closeBundle')
    all.invoke('closeBundle')
  })

  it.each(['', 'class', 'class=""', 'class="author"', ':class="dynamic"', 'class="author" :class="dynamic"'])('保留静态与动态 class：%s', (attributes) => {
    const f = fixture()
    const first = f.run(`<view ${attributes}/>`)
    expect(first.match(/weapp-tw-border/g)).toHaveLength(1)
    if (attributes.includes('author')) {
      expect(first).toContain('weapp-tw-border author')
    }
    if (attributes.includes('dynamic')) {
      expect(first).toContain('_ctx.dynamic')
    }
    expect(f.run(`<view ${attributes}/>`)).toBe(first)
    expect(f.run('<view class="weapp-tw-border author"/>').match(/weapp-tw-border/g)).toHaveLength(1)
    f.invoke('closeBundle')
  })

  it('禁用与非 UVue/NVue 模板不修改作者配置或模板', () => {
    const disabled = fixture({ isEnabled: () => false })
    expect(disabled.api.options).toBe(disabled.original)
    expect(disabled.run('<view/>')).not.toContain('weapp-tw-border')
    const f = fixture()
    expect(f.run('<view/>', '/project/Probe.vue')).not.toContain('weapp-tw-border')
    disabled.invoke('closeBundle')
    f.invoke('closeBundle')
  })

  it('注册与启动校核幂等，平台后来替换选项仍可补回本实例', () => {
    const author: NodeTransform = () => undefined
    const f = fixture({}, [author])
    const installed = f.api.options
    f.invoke('buildStart')
    f.invoke('buildStart')
    expect(f.api.options).toBe(installed)
    expect(installed.template.compilerOptions.nodeTransforms).toHaveLength(2)
    const replacement = { ...f.original, template: { compilerOptions: { nodeTransforms: [author] } } }
    f.api.options = replacement
    f.invoke('buildStart')
    expect(f.run('<view/>')).toContain('weapp-tw-border')
    f.invoke('closeBundle')
    expect(f.api.options).toEqual(replacement)
  })

  it('收尾保留后来插件的选项与回调，只释放本实例', () => {
    const author: NodeTransform = () => undefined
    const later: NodeTransform = () => undefined
    const f = fixture({}, [author])
    const transforms = f.api.options.template.compilerOptions.nodeTransforms
    f.api.options = { ...f.api.options, author: false, template: { compilerOptions: { nodeTransforms: [...transforms, later] } } }
    f.invoke('closeBundle')
    expect(f.api.options.author).toBe(false)
    expect(f.api.options.template.compilerOptions.nodeTransforms).toEqual([author, later])
    f.invoke('closeWatcher')
    expect(f.api.options.template.compilerOptions.nodeTransforms).toEqual([author, later])
  })

  it('watch 每轮 closeBundle 后仍在下一轮 buildStart 复装，最终关闭才释放配置', () => {
    const f = fixture()
    const watchConfig = { plugins: [{ name: 'vite:vue', api: f.api }], build: { watch: {} } } as unknown as ResolvedConfig
    f.invoke('configResolved', watchConfig)
    f.invoke('buildStart')
    expect(f.run('<view/>')).toContain('weapp-tw-border')
    f.invoke('closeBundle')
    expect(f.api.options).toEqual(f.original)
    f.invoke('buildStart')
    expect(f.run('<view/>')).toContain('weapp-tw-border')
    f.invoke('closeBundle')
    f.invoke('closeWatcher')
    f.invoke('buildStart')
    expect(f.api.options).toEqual(f.original)
    expect(f.run('<view/>')).not.toContain('weapp-tw-border')
  })

  it('保留编译器和作者在既有 options 对象上的原地更新', () => {
    const author: NodeTransform = () => undefined
    const later: NodeTransform = () => undefined
    const f = fixture({}, [author])
    const installed = f.api.options as typeof f.original & { compiler?: object }
    const compiler = { version: 'vendor-compiler' }
    installed.compiler = compiler
    installed.author = false
    installed.template.compilerOptions.nodeTransforms.push(later)
    f.invoke('closeBundle')
    expect((f.api.options as typeof installed).compiler).toBe(compiler)
    expect(f.api.options.author).toBe(false)
    expect(f.api.options.template.compilerOptions.nodeTransforms).toEqual([author, later])
    expect(f.originalTransforms).toEqual([author])
  })

  it('独立插件实例不共享编译器配置或 AST', () => {
    const first = fixture()
    const second = fixture()
    expect(first.api.options.template.compilerOptions.nodeTransforms[0]).not.toBe(second.api.options.template.compilerOptions.nodeTransforms[0])
    first.invoke('closeBundle')
    expect(first.run('<view/>')).not.toContain('weapp-tw-border')
    expect(second.run('<view/>')).toContain('weapp-tw-border')
    second.invoke('closeBundle')
  })

  it('兼容 Vapor 的 node/options.filename，不借用其他 AST 节点', () => {
    const f = fixture()
    const transform = f.api.options.template.compilerOptions.nodeTransforms[0]!
    const node = parse('<view :class="dynamic"/>').children[0]!
    const exit = transform(node, { node, options: { filename: 'Probe.uvue' } } as any) as () => void
    expect(exit).toBeTypeOf('function')
    exit()
    expect(node).toMatchObject({ props: [
      { type: NodeTypes.ATTRIBUTE, name: 'class', value: { content: 'weapp-tw-border' } },
      { type: NodeTypes.DIRECTIVE, name: 'bind' },
    ] })
    f.invoke('closeBundle')
  })
})
