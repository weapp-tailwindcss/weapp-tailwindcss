import type { Input } from 'postcss'
import type { Px2rpxOptions } from '@/types'
import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import { createStyleHandler } from '@/handler'

const css = '.a{width:10px;height:20px}'

function createHandler(px2rpx: boolean | Px2rpxOptions) {
  const onDiagnostic = vi.fn()
  const handler = createStyleHandler({
    cssPreflight: false,
    cssCalc: false,
    cssPresetEnv: { features: { 'custom-properties': false } },
    px2rpx,
    onDiagnostic,
  })
  return { handler, onDiagnostic }
}

function getInput(root: postcss.Root): Input {
  const input = root.source?.input
  if (!input) {
    throw new Error('Expected a parsed Input')
  }
  return input
}

describe('动态 px2rpx 设计稿的处理会话', () => {
  it('相同文本与回调身份也逐轮读取当前闭包', async () => {
    let width = 750
    const designWidth = vi.fn(() => width)
    const options = { designWidth }
    const { handler, onDiagnostic } = createHandler(options)
    const pipeline = handler.getPipeline()
    expect(designWidth).not.toHaveBeenCalled()
    expect((await handler(css)).css).toBe('.a{width:10rpx;height:20rpx}')
    const calls = designWidth.mock.calls.length
    width = 375
    const second = await handler(css)
    expect(second.css).toBe('.a{width:20rpx;height:40rpx}')
    expect(designWidth.mock.calls.length).toBeGreaterThan(calls)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    expect(handler.getPipeline()).toBe(pipeline)
  })

  it('同一 Input 的文档改变后，不复用上一轮插件派生倍率', async () => {
    const designWidth = vi.fn((input: Input) => input.document === 'compact' ? 375 : 750)
    const { handler, onDiagnostic } = createHandler({ designWidth })
    const root = postcss.parse(css, { from: 'same.css', document: 'wide' })
    const input = getInput(root)
    expect((await handler.transformRoot(root)).css).toBe('.a{width:10rpx;height:20rpx}')
    input.document = 'compact'
    const current = await handler.transformRoot(root)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    expect(current.css).toBe((await createHandler({ designWidth }).handler.transformRoot(root)).css)
    expect(current.css).toBe('.a{width:20rpx;height:40rpx}')
    expect(current.root.source?.input).toBe(input)
    expect(root.toString()).toBe(css)
  })

  it('公开 pipeline 被同一个 Processor 复用时也隔离派生倍率', async () => {
    const designWidth = vi.fn((input: Input) => input.document === 'compact' ? 375 : 750)
    const pipeline = createHandler({ designWidth }).handler.getPipeline()
    const processor = postcss(pipeline.plugins)
    const root = postcss.parse(css, { from: 'same.css', document: 'wide' })
    const input = getInput(root)
    expect(designWidth).not.toHaveBeenCalled()
    const first = await processor.process(root.clone(), { from: input.file })
    expect(first.css).toBe('.a{width:10rpx;height:20rpx}')
    expect(designWidth).toHaveBeenCalledTimes(1)
    input.document = 'compact'
    const second = await processor.process(root.clone(), { from: input.file })
    expect(second.css).toBe('.a{width:20rpx;height:40rpx}')
    expect(designWidth).toHaveBeenCalledTimes(2)
    expect(second.root.source?.input).toBe(input)
    expect(root.toString()).toBe(css)
  })

  it('提前创建多个 LazyResult 不共享后续的每 Input 倍率', async () => {
    const designWidth = vi.fn((input: Input) => input.document === 'compact' ? 375 : 750)
    const processor = postcss(createHandler({ designWidth }).handler.getPipeline().plugins)
    const root = postcss.parse(css, { from: 'same.css', document: 'compact' })
    const input = getInput(root)
    const first = processor.process(root.clone(), { from: input.file })
    const second = processor.process(root.clone(), { from: input.file })
    expect(designWidth).not.toHaveBeenCalled()
    expect((await first).css).toBe('.a{width:20rpx;height:40rpx}')
    input.document = 'wide'
    expect((await second).css).toBe('.a{width:10rpx;height:20rpx}')
    expect(designWidth).toHaveBeenCalledTimes(2)
  })

  it.each([
    { options: true, expected: '.a{width:10rpx;height:20rpx}' },
    { options: { designWidth: 750 }, expected: '.a{width:10rpx;height:20rpx}' },
    { options: { designWidth: 375 }, expected: '.a{width:20rpx;height:40rpx}' },
    { options: false, expected: css },
  ])('静态配置 $options 保留默认命中与 pipeline 复用', async ({ options, expected }) => {
    const { handler, onDiagnostic } = createHandler(options)
    const pipeline = handler.getPipeline()
    expect((await handler(css)).css).toBe(expected)
    expect((await handler(css)).css).toBe(expected)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
    expect(handler.getPipeline()).toBe(pipeline)
  })

  it.each(['rootValue', 'root_value'] as const)('显式 %s 常量使 designWidth 成为未消费回调', async (key) => {
    const designWidth = vi.fn(() => 375)
    const { handler, onDiagnostic } = createHandler({ designWidth, [key]: 2 })
    expect((await handler(css)).css).toBe('.a{width:5rpx;height:10rpx}')
    expect((await handler(css)).css).toBe('.a{width:5rpx;height:10rpx}')
    expect(designWidth).not.toHaveBeenCalled()
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
  })

  it('回调的原始异常在实际处理时传播，组装管线不预执行', async () => {
    const original = { reason: 'design width' }
    const designWidth = vi.fn(() => {
      throw original
    })
    const { handler } = createHandler({ designWidth })
    expect(handler.getPipeline()).toBeDefined()
    expect(designWidth).not.toHaveBeenCalled()
    await expect(handler(css)).rejects.toBe(original)
    expect(designWidth).toHaveBeenCalledTimes(1)
  })
})
