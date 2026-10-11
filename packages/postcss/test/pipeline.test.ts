import type { FeatureSignal } from '@/content-probe'
import type { IStyleHandlerOptions } from '@/types'
import { EMPTY_SIGNAL, FULL_SIGNAL } from '@/content-probe'
import { describe, expect, it } from 'vitest'
import { createStyleHandler } from '@/handler'
import { createStylePipeline } from '@/pipeline'

const TW_CUSTOM_PROP_RE = /^--tw-/

function createOptions(partial: Partial<IStyleHandlerOptions>): IStyleHandlerOptions {
  return {
    cssPresetEnv: {
      features: {},
      autoprefixer: { add: false },
    },
    ...partial,
  } as IStyleHandlerOptions
}

describe('style processing pipeline', () => {
  it('links nodes with stage-aware context', () => {
    const options = createOptions({
      px2rpx: true,
      rem2rpx: true,
      cssCalc: {
        includeCustomProperties: [TW_CUSTOM_PROP_RE],
      },
    })

    const pipeline = createStylePipeline(options)
    const ids = pipeline.nodes.map(node => node.id)
    expect(ids).toEqual([
      'pre:calc',
      'pre:core',
      'normal:preset-env',
      'normal:color-functional-fallback',
      'normal:px-transform',
      'normal:rem-transform',
      'normal:calc-duplicate-cleaner',
      'normal:custom-property-cleaner',
      'post:core',
    ])

    pipeline.nodes.forEach((node, index, allNodes) => {
      expect(node.context.index).toBe(index)
      expect(node.context.size).toBe(allNodes.length)

      const previous = index > 0 ? allNodes[index - 1] : undefined
      const next = index < allNodes.length - 1 ? allNodes[index + 1] : undefined

      expect(node.context.previous).toEqual(previous && { id: previous.id, stage: previous.stage })
      expect(node.context.next).toEqual(next && { id: next.id, stage: next.stage })

      const seenInStage = allNodes.slice(0, index).filter(item => item.stage === node.stage).length
      expect(node.context.stageIndex).toBe(seenInStage)

      const totalInStage = allNodes.filter(item => item.stage === node.stage).length
      expect(node.context.stageSize).toBe(totalInStage)
    })
  })

  it('includes user plugins inside the pre stage', () => {
    const userPlugin = { postcssPlugin: 'user-plugin' }
    const options = createOptions({
      postcssOptions: {
        plugins: [userPlugin],
      },
      cssCalc: false,
      px2rpx: false,
      rem2rpx: false,
    })

    const pipeline = createStylePipeline(options)
    const ids = pipeline.nodes.map(node => node.id)
    expect(ids).toEqual([
      'pre:user-0',
      'pre:core',
      'normal:preset-env',
      'normal:color-functional-fallback',
      'post:core',
    ])

    const [userNode, preNode] = pipeline.nodes
    expect(userNode.stage).toBe('pre')
    expect(preNode.stage).toBe('pre')
    expect(userNode.context.stageSize).toBe(2)
    expect(preNode.context.stageIndex).toBe(1)
  })

  it('adds units-to-px when enabled', () => {
    const options = createOptions({
      unitsToPx: true,
      px2rpx: false,
      rem2rpx: false,
      cssCalc: false,
    })

    const pipeline = createStylePipeline(options)
    const ids = pipeline.nodes.map(node => node.id)
    expect(ids).toEqual([
      'pre:core',
      'normal:preset-env',
      'normal:color-functional-fallback',
      'normal:units-to-px',
      'post:core',
    ])
  })

  it('adds unit-conversion after legacy unit transforms when configured', () => {
    const options = createOptions({
      unitsToPx: true,
      px2rpx: true,
      rem2rpx: true,
      unitConversion: {
        rules: [
          { from: 'rpx', to: 'px', factor: 0.5 },
        ],
      },
      cssCalc: false,
    })

    const pipeline = createStylePipeline(options)
    const ids = pipeline.nodes.map(node => node.id)
    expect(ids).toEqual([
      'pre:core',
      'normal:preset-env',
      'normal:color-functional-fallback',
      'normal:units-to-px',
      'normal:px-transform',
      'normal:rem-transform',
      'normal:unit-conversion',
      'post:core',
    ])
  })

  it('adds autoprefixer by default for Tailwind CSS v4', () => {
    const options = createOptions({
      majorVersion: 4,
      px2rpx: false,
      rem2rpx: false,
      cssCalc: false,
    })

    const pipeline = createStylePipeline(options)
    const ids = pipeline.nodes.map(node => node.id)

    expect(ids).toEqual([
      'pre:core',
      'normal:preset-env',
      'normal:color-functional-fallback',
      'normal:autoprefixer',
      'post:core',
    ])
  })

  it('skips default autoprefixer when user configured autoprefixer', () => {
    const options = createOptions({
      majorVersion: 4,
      postcssOptions: {
        plugins: [{ postcssPlugin: 'autoprefixer' }],
      },
      px2rpx: false,
      rem2rpx: false,
      cssCalc: false,
    })

    const pipeline = createStylePipeline(options)
    const ids = pipeline.nodes.map(node => node.id)

    expect(ids).toContain('pre:user-0')
    expect(ids).not.toContain('normal:autoprefixer')
  })

  it('exposes cached pipeline through the style handler API', () => {
    const handler = createStyleHandler({
      cssPresetEnv: {
        features: {},
        autoprefixer: { add: false },
      },
    })

    const basePipeline = handler.getPipeline()
    expect(basePipeline.nodes[0]?.stage).toBe('pre')

    const overridePipeline = handler.getPipeline({
      px2rpx: true,
      cssCalc: {
        includeCustomProperties: [TW_CUSTOM_PROP_RE],
      },
    })

    expect(overridePipeline.nodes.some(node => node.id === 'normal:px-transform')).toBe(true)
    expect(overridePipeline.nodes.some(node => node.id === 'normal:custom-property-cleaner')).toBe(true)
  })

  it('keeps cascade layers away from preset-env even when users enable the feature', async () => {
    const handler = createStyleHandler({
      majorVersion: 4,
      cssPresetEnv: {
        features: {
          'cascade-layers': true,
        },
        autoprefixer: { add: false },
      },
    })

    const result = await handler('@layer base, utilities;@layer utilities{.card{color:red}}')

    expect(result.css).toBe('.card{color:red}')
    expect(result.css).not.toMatch(/:not\(#(?:n|\\#)?\)/)
  })
})

describe('signal-driven pipeline pruning', () => {
  it('excludes preset-env and color-functional-fallback when signal is all false', () => {
    const options = createOptions({
      px2rpx: false,
      rem2rpx: false,
      cssCalc: false,
    })

    const pipeline = createStylePipeline(options, EMPTY_SIGNAL)
    const ids = pipeline.nodes.map(node => node.id)

    expect(ids).not.toContain('normal:preset-env')
    expect(ids).not.toContain('normal:color-functional-fallback')
    expect(ids).toContain('pre:core')
    expect(ids).toContain('post:core')
  })

  it('includes all plugins when signal is all true', () => {
    const options = createOptions({
      px2rpx: false,
      rem2rpx: false,
      cssCalc: false,
    })

    const pipeline = createStylePipeline(options, FULL_SIGNAL)
    const ids = pipeline.nodes.map(node => node.id)

    expect(ids).toContain('normal:preset-env')
    expect(ids).toContain('normal:color-functional-fallback')
    expect(ids).toContain('pre:core')
    expect(ids).toContain('post:core')
  })

  it('behaves the same as current when signal is undefined', () => {
    const options = createOptions({
      px2rpx: false,
      rem2rpx: false,
      cssCalc: false,
    })

    const withSignal = createStylePipeline(options, FULL_SIGNAL)
    const withoutSignal = createStylePipeline(options)

    const idsWithSignal = withSignal.nodes.map(node => node.id)
    const idsWithoutSignal = withoutSignal.nodes.map(node => node.id)

    expect(idsWithoutSignal).toEqual(idsWithSignal)
  })

  it('prunes correctly with mixed signal (one true, one false)', () => {
    const options = createOptions({
      px2rpx: false,
      rem2rpx: false,
      cssCalc: false,
    })

    const onlyPresetEnv: FeatureSignal = {
      hasPresetEnvFeatures: true,
      hasModernColorFunction: false,
    }
    const pipeline1 = createStylePipeline(options, onlyPresetEnv)
    const ids1 = pipeline1.nodes.map(node => node.id)
    expect(ids1).toContain('normal:preset-env')
    expect(ids1).not.toContain('normal:color-functional-fallback')

    const onlyColor: FeatureSignal = {
      hasPresetEnvFeatures: false,
      hasModernColorFunction: true,
    }
    const pipeline2 = createStylePipeline(options, onlyColor)
    const ids2 = pipeline2.nodes.map(node => node.id)
    expect(ids2).not.toContain('normal:preset-env')
    expect(ids2).toContain('normal:color-functional-fallback')
  })

  it('pre/post stage plugins are not affected by signal', () => {
    const userPlugin = { postcssPlugin: 'user-plugin' }
    const options = createOptions({
      postcssOptions: { plugins: [userPlugin] },
      px2rpx: false,
      rem2rpx: false,
      cssCalc: false,
    })

    const pipeline = createStylePipeline(options, EMPTY_SIGNAL)
    const ids = pipeline.nodes.map(node => node.id)

    expect(ids).toContain('pre:user-0')
    expect(ids).toContain('pre:core')
    expect(ids).toContain('post:core')
  })

  it('option-controlled plugins are not affected by signal', () => {
    const options = createOptions({
      unitsToPx: true,
      px2rpx: true,
      rem2rpx: true,
      unitConversion: {
        rules: [
          { from: 'rpx', to: 'px', factor: 0.5 },
        ],
      },
      cssCalc: {
        includeCustomProperties: [/^--tw-/],
      },
    })

    const pipeline = createStylePipeline(options, EMPTY_SIGNAL)
    const ids = pipeline.nodes.map(node => node.id)

    // 信号为全 false，preset-env 和 color-functional-fallback 被裁剪
    expect(ids).not.toContain('normal:preset-env')
    expect(ids).not.toContain('normal:color-functional-fallback')

    // 基于选项控制的插件不受信号影响
    expect(ids).toContain('normal:units-to-px')
    expect(ids).toContain('normal:px-transform')
    expect(ids).toContain('normal:rem-transform')
    expect(ids).toContain('normal:unit-conversion')
    expect(ids).toContain('pre:calc')
    expect(ids).toContain('normal:calc-duplicate-cleaner')
    expect(ids).toContain('normal:custom-property-cleaner')
    expect(ids).toContain('pre:core')
    expect(ids).toContain('post:core')
  })
})
