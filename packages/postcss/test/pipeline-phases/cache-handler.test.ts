import type { Plugin } from 'postcss'
import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import cssMacro from '@/css-macro/postcss'
import { createStyleHandler } from '@/handler'
import { createStylePipeline } from '@/pipeline'
import { StyleProcessorCache } from '@/processor-cache'
import { options } from './helpers'

describe('实际阶段配方的缓存与 handler 消费', () => {
  it('pipeline 与 processor 两个入口复用同一阶段配方，不重复构造作者与插入成员', async () => {
    const creator = vi.fn(() => ({ postcssPlugin: 'author' }))
    const insertion: Plugin = { postcssPlugin: 'insertion', prepare: vi.fn(() => ({})) }
    const configured = options({
      postcssOptions: { plugins: [Object.assign(creator, { postcss: true as const })], options: { from: 'first.css' } },
      cssPresetEnv: { stage: false, autoprefixer: false, features: { 'custom-media-queries': true }, insertBefore: { 'custom-media-queries': insertion } },
    })
    const cache = new StyleProcessorCache()
    const pipeline = cache.getPipeline(configured)
    expect(pipeline.kind).toBe('phased')
    expect(cache.getProcessor(configured)).toBe(pipeline)
    expect(cache.getPipeline({ ...configured, postcssOptions: { ...configured.postcssOptions, options: { from: 'second.css' } } })).toBe(pipeline)
    await pipeline.process('.a{width:calc(1px + 2px)}', cache.getProcessOptions(configured))
    await pipeline.process('.b{width:calc(2px + 3px)}', { from: 'second.css' })
    expect(creator).toHaveBeenCalledTimes(1)
    expect(insertion.prepare).toHaveBeenCalledTimes(2)
    const changed = cache.getPipeline({ ...configured, rem2rpx: true })
    expect(changed).not.toBe(pipeline)
  })

  it('访问器插入保守旁路 cache，但同一显式计划执行不再次归一化成员', async () => {
    let getterReads = 0
    const insertion: Plugin = { postcssPlugin: 'opaque-insertion' }
    Object.defineProperty(insertion, 'postcss', { get() {
      getterReads++
      return false
    } })
    const configured = options({
      postcssOptions: { plugins: [{ postcssPlugin: 'author' }] },
      cssPresetEnv: { stage: false, autoprefixer: false, features: { 'custom-media-queries': true }, insertBefore: { 'custom-media-queries': insertion } },
    })
    const cache = new StyleProcessorCache()
    const pipeline = cache.getPipeline(configured)
    const readsAfterConstruction = getterReads
    expect(readsAfterConstruction).toBeGreaterThan(0)
    await pipeline.process('.a{width:1px}', { from: undefined })
    await pipeline.process('.b{width:2px}', { from: undefined })
    expect(getterReads).toBe(readsAfterConstruction)
    expect(cache.getPipeline(configured)).not.toBe(pipeline)
    expect(cache.getProcessor(configured)).not.toBe(pipeline)
  })

  it('真实已登记 macro 通过 handler 核心阶段执行，保留结果命中及 Root 克隆', async () => {
    const onDiagnostic = vi.fn()
    const handler = createStyleHandler(options({ postcssOptions: { plugins: [cssMacro()] }, onDiagnostic }))
    const pipeline = handler.getPipeline()
    expect(pipeline.kind).toBe('phased')
    const execution = vi.spyOn(pipeline, 'process')
    const css = '.a{width:calc(1px + 2px)}'
    const first = await handler(css)
    expect(first.css).toBe('.a{width:3px}')
    expect(execution).toHaveBeenCalledTimes(1)
    expect((await handler(css)).css).toBe(first.css)
    expect(execution).toHaveBeenCalledTimes(1)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
    const root = postcss.parse(css, { from: 'caller.css' })
    const result = await handler.transformRoot(root)
    expect(result.css).toBe(first.css)
    expect(result.root).not.toBe(root)
    expect(result.root.source?.input).toBe(root.source?.input)
    expect(root.toString()).toBe(css)
    result.root.removeAll()
    expect((await handler.transformRoot(root)).css).toBe(first.css)
    expect(handler.getPipeline()).toBe(pipeline)
  })

  it('默认自动 calc 以真实平台谓词分流；native author 提前返回仍是 flat', () => {
    const users = { plugins: [{ postcssPlugin: 'author' }] }
    expect(createStylePipeline(options({ cssCalc: 'auto', majorVersion: 4, platform: 'h5', postcssOptions: users })).kind).toBe('flat')
    expect(createStylePipeline(options({ cssCalc: 'auto', majorVersion: 4, platform: 'mp-weixin', postcssOptions: users })).kind).toBe('phased')
    const configured = { ...options({ uniAppX: true, uniAppXCssTarget: 'uvue', postcssOptions: users }), uniAppXCssSource: 'author' as const }
    const author = createStylePipeline(configured)
    const applyOptions = { ...configured, uniAppXCssSource: 'author-apply' as const }
    const apply = createStylePipeline(applyOptions)
    expect(author.kind).toBe('flat')
    expect(author.nodes).toHaveLength(0)
    expect(apply.kind).toBe('flat')
    expect(apply.nodes.map(node => node.id)).not.toContain('pre:user-0')
  })
})
