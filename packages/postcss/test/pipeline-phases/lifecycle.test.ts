import type { Plugin, ProcessOptions, Result } from 'postcss'
import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import { createStylePipeline } from '@/pipeline'
import { getPlugins } from '@/plugins'
import * as contextModule from '@/plugins/ctx'
import { gate, options } from './helpers'

describe('真实阶段管线的生命周期', () => {
  it('flat 保留真实插件和原生同步组合，phased 不伪造可平铺接口', async () => {
    const creator = vi.fn(() => ({ postcssPlugin: 'author' }))
    const plugin = Object.assign(creator, { postcss: true as const })
    const flat = createStylePipeline(options({ cssCalc: false, postcssOptions: { plugins: [plugin] } }))
    expect(flat.kind).toBe('flat')
    expect(creator).not.toHaveBeenCalled()
    if (flat.kind !== 'flat') {
      throw new Error('Expected flat')
    }
    expect(flat.nodes[0]?.plugin).toBe(plugin)
    const native = postcss(flat.plugins).process('.a{width:1px}', { from: undefined })
    expect(native.sync().root.toString()).toBe('.a{width:1px}')
    expect(native.css).toBe('.a{width:1px}')
    expect(creator).toHaveBeenCalledTimes(1)
    const phasedOptions = options({ postcssOptions: { plugins: [plugin] } })
    const phased = createStylePipeline(phasedOptions)
    expect(phased.kind).toBe('phased')
    expect(phased).not.toHaveProperty('plugins')
    expect(phased.nodes.every(node => !('plugin' in node))).toBe(true)
    expect(phased.nodes[0]).toMatchObject({ id: 'pre:user-0', phase: 'author' })
    if (phased.kind !== 'phased') {
      throw new Error('Expected phased')
    }
    expect(phased.controls).toEqual([
      { postcssPlugin: 'weapp-tailwindcss-author-options', phase: 'author', hook: 'prepare', position: 'first' },
      { postcssPlugin: 'weapp-tailwindcss-phase-messages', phase: 'platform', hook: 'prepare', position: 'first' },
    ])
    expect(() => getPlugins(phasedOptions)).toThrow(/pipeline.process/)
    expect((await phased.process('.a{width:calc(1px + 2px)}', { from: undefined })).css).toBe('.a{width:3px}')
  })

  it('完整作者序列化后才准备真实 preset，并直接交接替换 Root、Input、消息与原选项', async () => {
    const events: string[] = []
    const original = postcss.parse('@custom-media --wide (width >= 10em);@media (--wide){.a{width:calc(1px + 2px)}}', { from: 'original.css' })
    const replacement = postcss.parse('@custom-media --wide (width >= 30em);@media (--wide){.b{width:calc(2px + 3px)}}', { from: 'replacement.css' })
    const input = replacement.source?.input
    const originalFirst = original.first
    if (!originalFirst) {
      throw new Error('Expected the custom-media definition')
    }
    const warning = new postcss.Warning('author warning', { plugin: 'author', node: originalFirst })
    const late = { type: 'late', plugin: 'author', node: original.first }
    const processOptions: ProcessOptions = { from: 'outer.css', to: 'outer.out.css', map: { inline: false, annotation: false } }
    let authorResult: Result | undefined
    const author: Plugin = {
      postcssPlugin: 'author',
      prepare(result) {
        authorResult = result
        expect(result.opts).not.toBe(processOptions)
        expect(result.opts.map).toBe(false)
        return {
          async Once() {
            events.push('author-once')
            await Promise.resolve()
          },
          OnceExit(_root, { result }) {
            events.push('author-exit')
            result.root = replacement
            result.messages.push(warning)
          },
        }
      },
    }
    const insertion: Plugin = {
      postcssPlugin: 'preset-observer',
      prepare(result) {
        events.push('preset-prepare')
        expect(events).toEqual(['author-once', 'author-exit', 'author-stringifier', 'preset-prepare'])
        expect(result.root).toBe(replacement)
        expect(result.root.source?.input).toBe(input)
        expect(result.opts).toBe(processOptions)
        expect(result.messages).not.toBe(authorResult?.messages)
        expect(result.messages[0]).toBe(warning)
        expect(result.messages[1]).toBe(late)
        return {}
      },
    }
    const pipeline = createStylePipeline(options({
      postcssOptions: { plugins: [author] },
      cssPresetEnv: { stage: false, autoprefixer: false, features: { 'custom-media-queries': true }, insertBefore: { 'custom-media-queries': insertion } },
    }))
    processOptions.stringifier = (root, builder) => {
      if (!events.includes('preset-prepare')) {
        events.push('author-stringifier')
        authorResult?.messages.push(late)
      }
      postcss.stringify(root, builder)
    }
    const result = await pipeline.process(original, processOptions, [{
      postcssPlugin: 'after',
      OnceExit(_root, { result }) {
        result.messages.push({ type: 'after', plugin: 'after' })
      },
    }])
    expect(result.root).toBe(replacement)
    expect(result.css).toContain('30em')
    expect(result.css).toContain('width:5px')
    expect(result.css).not.toContain('10em')
    expect(result.messages.slice(0, 2)).toEqual([warning, late])
    expect(result.messages.at(-1)?.type).toBe('after')
    expect(original.toString()).toContain('10em')
  })

  it('同一计划保留作者和插入成员，四次执行只新建本轮 ctx/pre/post', async () => {
    const contextSpy = vi.spyOn(contextModule, 'createContext')
    const blocked = gate()
    const started = gate()
    let constructions = 0
    let prepareCalls = 0
    let serializeCalls = 0
    let currentWidth = 20
    const author = Object.assign(() => {
      constructions++
      return {
        postcssPlugin: 'stable-author',
        prepare() {
          const width = currentWidth
          return { async Once(root: postcss.Root) {
            root.walkAtRules('custom-media', (rule) => {
              rule.params = `--wide (width >= ${width}em)`
            })
            if (width === 40) {
              started.release()
              await blocked.promise
            }
          } }
        },
      }
    }, { postcss: true as const })
    const processors: postcss.Processor[] = []
    const insertion: Plugin = {
      postcssPlugin: 'retained-insertion',
      prepare(result) {
        prepareCalls++
        expect(this).toBe(insertion)
        processors.push(result.processor)
        return {}
      },
    }
    try {
      const pipeline = createStylePipeline(options({
        postcssOptions: { plugins: [author] },
        cssPresetEnv: { stage: false, autoprefixer: false, features: { 'custom-media-queries': true }, insertBefore: { 'custom-media-queries': insertion } },
      }))
      const input = '@custom-media --wide (width >= 10em);@media (--wide){.a{width:1px}}'
      const run = () => pipeline.process(input, { from: undefined, stringifier(root, builder) {
        serializeCalls++
        postcss.stringify(root, builder)
      } })
      expect((await run()).css).toContain('20em')
      currentWidth = 30
      expect((await run()).css).toContain('30em')
      currentWidth = 40
      const a = run()
      await started.promise
      currentWidth = 50
      expect((await run()).css).toContain('50em')
      blocked.release()
      expect((await a).css).toContain('40em')
      expect(constructions).toBe(1)
      expect(prepareCalls).toBe(4)
      expect(serializeCalls).toBe(8)
      expect(new Set(contextSpy.mock.results.map(result => result.value)).size).toBe(5)
      const pre = processors.map(processor => processor.plugins.find(plugin => typeof plugin === 'object' && plugin.postcssPlugin === 'postcss-weapp-tailwindcss-rename-plugin'))
      const post = processors.map(processor => processor.plugins.filter(plugin => typeof plugin === 'object' && plugin.postcssPlugin === 'postcss-weapp-tailwindcss-rename-plugin')[1])
      expect(pre.every(Boolean)).toBe(true)
      expect(post.every(Boolean)).toBe(true)
      expect(new Set(pre).size).toBe(4)
      expect(new Set(post).size).toBe(4)
      expect(processors.every(processor => processor.plugins.includes(insertion))).toBe(true)
    }
    finally {
      blocked.release()
      contextSpy.mockRestore()
    }
  })
})
