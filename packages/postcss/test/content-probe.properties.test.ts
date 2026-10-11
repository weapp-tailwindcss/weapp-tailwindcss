import type { FeatureSignal } from '@/content-probe'
import type { IStyleHandlerOptions } from '@/types'
import { EMPTY_SIGNAL, FULL_SIGNAL, probeFeatures } from '@/content-probe'
import { createStylePipeline } from '@/pipeline'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

// ---------------------------------------------------------------------------
// 辅助：生成器与工具函数
// ---------------------------------------------------------------------------

/** preset-env 特征关键字列表（与 content-probe.ts 中 PRESET_ENV_KEYWORDS 对齐） */
const PRESET_ENV_KEYWORDS = [
  ':is(',
  ':where(',
  ':not(',
  ':root',
  'oklab(',
  'oklch(',
  'color-mix(',
  '@layer ',
  'color(',
  'padding-inline',
  'padding-block',
  'margin-inline',
  'margin-block',
  'border-inline',
  'border-block',
  'border-start-start-radius',
  'border-start-end-radius',
  'border-end-start-radius',
  'border-end-end-radius',
  'inset-inline',
  'inset-block',
] as const

/** 现代颜色函数模板 */
const MODERN_COLOR_TEMPLATES = [
  'rgb(255 0 0 / 0.5)',
  'rgb(100 200 50 / 1)',
  'rgba(10 20 30 / 0.8)',
]

/** 生成包含指定关键字的随机 CSS 片段 */
function arbCssWithKeyword(keyword: string): fc.Arbitrary<string> {
  return fc.tuple(
    fc.array(fc.constantFrom('a', 'b', 'c', ' ', '.', '-', '{', '}', ':', ';', '\n'), { minLength: 0, maxLength: 30 }),
    fc.array(fc.constantFrom('x', 'y', 'z', ' ', '.', '-', '{', '}', ':', ';', '\n'), { minLength: 0, maxLength: 30 }),
  ).map(([prefix, suffix]) => `${prefix.join('')} ${keyword} ${suffix.join('')}`)
}

/** 生成包含现代颜色函数的随机 CSS */
function arbCssWithModernColor(): fc.Arbitrary<string> {
  return fc.tuple(
    fc.constantFrom(...MODERN_COLOR_TEMPLATES),
    fc.array(fc.constantFrom('a', 'b', ' ', '.', '{', '}', ':', ';', '\n'), { minLength: 0, maxLength: 20 }),
  ).map(([color, suffix]) => `.box { color: ${color}; } ${suffix.join('')}`)
}

/** 生成随机 FeatureSignal */
function arbFeatureSignal(): fc.Arbitrary<FeatureSignal> {
  return fc.record({
    hasModernColorFunction: fc.boolean(),
    hasPresetEnvFeatures: fc.boolean(),
  })
}

/** 构建最小可用选项 */
function createMinimalOptions(overrides?: Partial<IStyleHandlerOptions>): IStyleHandlerOptions {
  return {
    cssPresetEnv: {
      features: {},
      autoprefixer: { add: false },
    },
    px2rpx: false,
    rem2rpx: false,
    cssCalc: false,
    ...overrides,
  } as IStyleHandlerOptions
}

/** 获取 pipeline 节点 id 列表 */
function getNodeIds(options: IStyleHandlerOptions, signal?: FeatureSignal): string[] {
  return createStylePipeline(options, signal).nodes.map(n => n.id)
}


// ===========================================================================
// Property 1: 探测完备性（无漏报）
// ===========================================================================

describe('Feature: postcss-pipeline-pruning, Property 1: 探测完备性（无漏报）', () => {
  /**
   * **Validates: Requirements 1.2, 1.3, 6.1, 6.2**
   *
   * 对于每个 PRESET_ENV_KEYWORDS 中的关键字，生成包含该关键字的随机 CSS，
   * probeFeatures 返回的 hasPresetEnvFeatures 必须为 true。
   */
  it('包含 preset-env 关键字的 CSS 始终被检测到 hasPresetEnvFeatures', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PRESET_ENV_KEYWORDS).chain(kw => arbCssWithKeyword(kw).map(css => ({ css, keyword: kw }))),
        ({ css, keyword }) => {
          const signal = probeFeatures(css)
          expect(signal.hasPresetEnvFeatures).toBe(true)
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 1.2, 1.3, 6.1, 6.2**
   *
   * 对于现代颜色函数 rgb(r g b / a)，生成包含该语法的随机 CSS，
   * probeFeatures 返回的 hasModernColorFunction 必须为 true。
   */
  it('包含现代颜色函数的 CSS 始终被检测到 hasModernColorFunction', () => {
    fc.assert(
      fc.property(
        arbCssWithModernColor(),
        (css) => {
          const signal = probeFeatures(css)
          expect(signal.hasModernColorFunction).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ===========================================================================
// Property 2: 信号驱动的流水线裁剪
// ===========================================================================

describe('Feature: postcss-pipeline-pruning, Property 2: 信号驱动的流水线裁剪', () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3**
   *
   * 对于任意 FeatureSignal 组合：
   * - hasPresetEnvFeatures=false → 无 normal:preset-env
   * - hasModernColorFunction=false → 无 normal:color-functional-fallback
   * - 对应标志为 true → 包含对应节点
   */
  it('pipeline 节点列表根据信号正确包含/排除对应插件', () => {
    const options = createMinimalOptions()

    fc.assert(
      fc.property(
        arbFeatureSignal(),
        (signal) => {
          const ids = getNodeIds(options, signal)

          if (signal.hasPresetEnvFeatures) {
            expect(ids).toContain('normal:preset-env')
          }
          else {
            expect(ids).not.toContain('normal:preset-env')
          }

          if (signal.hasModernColorFunction) {
            expect(ids).toContain('normal:color-functional-fallback')
          }
          else {
            expect(ids).not.toContain('normal:color-functional-fallback')
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ===========================================================================
// Property 3: 信号隔离性
// ===========================================================================

describe('Feature: postcss-pipeline-pruning, Property 3: 信号隔离性', () => {
  /**
   * **Validates: Requirements 2.4, 2.5**
   *
   * 对于任意 FeatureSignal：
   * - pre:core 和 post:core 始终存在
   * - 基于选项控制的插件不受信号影响
   */
  it('pre:core 和 post:core 始终存在，选项控制的插件不受信号影响', () => {
    // 启用所有选项控制的插件
    const options = createMinimalOptions({
      unitsToPx: true,
      px2rpx: true,
      rem2rpx: true,
      cssCalc: {
        includeCustomProperties: [/^--tw-/],
      },
    })

    // 预先获取选项控制的插件列表（使用 FULL_SIGNAL 作为基线）
    const baseIds = getNodeIds(options, FULL_SIGNAL)
    const optionControlledPlugins = [
      'normal:calc',
      'normal:units-to-px',
      'normal:px-transform',
      'normal:rem-transform',
      'normal:calc-duplicate-cleaner',
      'normal:custom-property-cleaner',
    ].filter(id => baseIds.includes(id))

    fc.assert(
      fc.property(
        arbFeatureSignal(),
        (signal) => {
          const ids = getNodeIds(options, signal)

          // pre:core 和 post:core 始终存在
          expect(ids).toContain('pre:core')
          expect(ids).toContain('post:core')

          // 选项控制的插件不受信号影响
          for (const pluginId of optionControlledPlugins) {
            expect(ids).toContain(pluginId)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * **Validates: Requirements 2.4, 2.5**
   *
   * 当选项关闭时，选项控制的插件不存在，且不受信号影响。
   */
  it('选项关闭时，选项控制的插件始终不存在', () => {
    const options = createMinimalOptions({
      unitsToPx: false,
      px2rpx: false,
      rem2rpx: false,
      cssCalc: false,
    })

    fc.assert(
      fc.property(
        arbFeatureSignal(),
        (signal) => {
          const ids = getNodeIds(options, signal)

          expect(ids).toContain('pre:core')
          expect(ids).toContain('post:core')

          expect(ids).not.toContain('normal:units-to-px')
          expect(ids).not.toContain('normal:px-transform')
          expect(ids).not.toContain('normal:rem-transform')
          expect(ids).not.toContain('normal:calc')
          expect(ids).not.toContain('normal:calc-duplicate-cleaner')
          expect(ids).not.toContain('normal:custom-property-cleaner')
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ===========================================================================
// Property 4: 流水线等价性
// ===========================================================================

describe('Feature: postcss-pipeline-pruning, Property 4: 流水线等价性', () => {
  /**
   * **Validates: Requirements 5.1, 6.1, 6.3**
   *
   * 对于任意 CSS 字符串，使用 probeFeatures 得到的信号构建的裁剪流水线
   * 处理该 CSS 的结果与使用完整流水线（不传 signal）处理的结果完全一致。
   */
  it('裁剪流水线与完整流水线处理结果一致', async () => {
    // 混合生成：简单 CSS 和包含现代特征的 CSS
    const arbCSS = fc.oneof(
      // 简单 CSS（无现代特征）
      fc.constantFrom(
        '.box { color: red; }',
        '.container { font-size: 14px; margin: 10px; }',
        '.text { display: flex; padding: 8px; }',
        'view { background: #fff; border: 1px solid #ccc; }',
      ),
      // 包含 preset-env 特征的 CSS
      fc.constantFrom(
        ':is(.a, .b) { color: red; }',
        '@layer base { .a { color: red; } }',
        '.box { color: oklab(0.5 0.1 -0.1); }',
        '.box { color: oklch(0.7 0.15 180); }',
        '.box { color: color-mix(in srgb, red 50%, blue); }',
        '.box { padding-inline: 10px; }',
        '.box { margin-block: 10px; }',
      ),
      // 包含现代颜色函数的 CSS
      fc.constantFrom(
        '.box { color: rgb(255 0 0 / 0.5); }',
        '.box { background: rgba(10 20 30 / 0.8); }',
      ),
      // 混合特征
      fc.constantFrom(
        ':is(.a) { color: rgb(255 0 0 / 0.5); }',
        '@layer base { .a { color: oklch(0.7 0.15 180); } }',
      ),
    )

    await fc.assert(
      fc.asyncProperty(
        arbCSS,
        async (css) => {
          const signal = probeFeatures(css)
          const options = createMinimalOptions()

          // 裁剪流水线（使用信号）
          const prunedPipeline = createStylePipeline({ ...options }, signal)
          const prunedProcessor = postcss(prunedPipeline.plugins)

          // 完整流水线（不传信号）
          const fullPipeline = createStylePipeline({ ...options })
          const fullProcessor = postcss(fullPipeline.plugins)

          const [prunedResult, fullResult] = await Promise.all([
            prunedProcessor.process(css, { from: undefined }),
            fullProcessor.process(css, { from: undefined }),
          ])

          expect(prunedResult.css).toBe(fullResult.css)
        },
      ),
      { numRuns: 100 },
    )
  })
})
