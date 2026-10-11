import path from 'pathe'
import { createStyleHandler } from '@/handler'
import { postcss } from '@/index'
import { getCalcDuplicateCleaner } from '@/plugins/getCalcDuplicateCleaner'
import { generateCss } from './utils'

const MARGIN_LEFT_32RPX_RE = /margin-left: 32rpx;/g
const MARGIN_TOP_8RPX_RE = /margin-top:\s*8rpx;/g
const SPACING_VAR_RE = /--spacing/
const SPACING_EXACT_RE = /^--spacing$/

describe('calc', () => {
  it('默认的情况', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/calc'))
    expect(code.css).toMatchSnapshot()
  })

  it('设置 cssCalc true', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/calc'))

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: true,
    })
    const { css } = await styleHandler(code.css)
    expect(css).toMatchSnapshot()
  })

  it('传入 cssCalc 配置', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/calc'))

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: {
        mediaQueries: true,
        precision: 5,
        preserve: false,
        selectors: true,
      },
    })
    const { css } = await styleHandler(code.css)
    expect(css).toMatchSnapshot()
  })

  it('同时确保 custom-properties 也开启', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/calc'))

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: true,
    })
    const { css } = await styleHandler(code.css)
    expect(css).toMatchSnapshot()
  })

  it('cssCalc 和 rem2rpx 同时开启', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/calc'))

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: true,
      rem2rpx: true,
    })
    const { css } = await styleHandler(code.css)
    expect(css).toMatchSnapshot()
  })

  it('custom-properties 设置 preserve 为 true', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/calc'))

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssPresetEnv: {
        features: {
          'custom-properties': {
            preserve: true,
          },
        },
      },
    })
    const { css } = await styleHandler(code.css)
    expect(css).toMatchSnapshot()
  })

  it('rpx 运算', async () => {
    const code = `.a{ width: calc(100rpx + 100rpx); height: calc(100 * 100rpx);width: calc(68rpx * 4);height: calc(4 * 17rpx);width: calc(68 * 4rpx);height: calc(4rpx * 17);}`

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: true,
      // cssPresetEnv: {
      //   features: {
      //     'custom-properties': {
      //       preserve: true,
      //     },
      //   },
      // },
    })
    const { css } = await styleHandler(code)
    expect(css).toMatchSnapshot()
  })

  it('rpx + root 变量运算', async () => {
    const code = `:root{--ch:2}; .a{ width: calc(var(--ch) * 1rpx);}`

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: true,
      cssPresetEnv: {
        features: {
          'custom-properties': {
            preserve: true,
          },
        },
      },
    })
    const { css } = await styleHandler(code)
    expect(css).toMatchSnapshot()
  })

  it('rpx + root 变量运算去除', async () => {
    const code = `:root{--ch:2}; .a{ width: calc(var(--ch) * 1rpx);}`

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: true,
      cssPresetEnv: {
        features: {
          'custom-properties': {
            preserve: false,
          },
        },
      },
    })
    const { css } = await styleHandler(code)
    expect(css).toMatchSnapshot()
  })

  it('px 转化 + root 变量运算去除', async () => {
    const code = `:root{--ch:2}; .a{ width: calc(var(--ch) * 1px);}`

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: true,
      px2rpx: true,
    })
    const { css } = await styleHandler(code)
    expect(css).toMatchSnapshot()
  })

  it('cssCalc 传入数组', async () => {
    const code = `:root{--ch:2}; .a{ width: calc(var(--ch) * 1px);}`

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: ['--ch'],
      px2rpx: true,
    })
    const { css } = await styleHandler(code)
    expect(css).toMatchSnapshot()
  })

  it('cssCalc 传入 true 示例', async () => {
    const code = `page,
:root {
  --spacing: 8rpx;
}
.h-2 {
  height: calc(var(--spacing) * 2);
}`

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: true,
      px2rpx: true,
    })
    const { css } = await styleHandler(code)
    expect(css).toMatchSnapshot()
  })

  it('deduplicates fallback declarations when original output already contains them', async () => {
    const code = `page,
:root {
  --spacing: 8rpx;
}
.space-x-4>view+view {
  margin-left: 32rpx;
  margin-left: calc(var(--spacing) * 4);
}`

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: true,
      px2rpx: true,
    })
    const { css } = await styleHandler(code)
    const fallbackCount = css.match(MARGIN_LEFT_32RPX_RE)?.length ?? 0
    expect(fallbackCount).toBe(1)
    expect(css).not.toContain('margin-left: calc(var(--spacing)*4);')
  })

  it('removes duplicate literal declarations when cssCalc is enabled', async () => {
    const code = `.mt-1{ margin-top: 8rpx; margin-top: 8rpx; }`

    const styleHandler = createStyleHandler({
      isMainChunk: false,
      cssCalc: true,
    })
    const { css } = await styleHandler(code, {
      isMainChunk: false,
    })
    const count = css.match(MARGIN_TOP_8RPX_RE)?.length ?? 0
    expect(count).toBe(1)
  })

  it('removes equivalent Tailwind space calc declarations across fallback groups', async () => {
    const code = `page { --spacing: 8rpx; }
.space-y-4 {
  --tw-space-y-reverse: 0;
  margin-bottom: 0rpx;
  margin-bottom: calc((var(--spacing) * 4) * var(--tw-space-y-reverse));
  margin-bottom: 0rpx;
  margin-bottom: calc(var(--spacing) * 4 * var(--tw-space-y-reverse));
  margin-top: 32rpx;
  margin-top: calc((var(--spacing) * 4) * (1 - var(--tw-space-y-reverse)));
  margin-top: 32rpx;
  margin-top: calc(var(--spacing) * 4 * (1 - var(--tw-space-y-reverse)));
}`

    const styleHandler = createStyleHandler({
      isMainChunk: false,
      cssCalc: true,
    })
    const { css } = await styleHandler(code, {
      isMainChunk: false,
    })

    expect(css.match(/margin-bottom:\s*0rpx;/g)).toHaveLength(1)
    expect(css.match(/margin-bottom:\s*calc\(/g)).toHaveLength(1)
    expect(css.match(/margin-top:\s*32rpx;/g)).toHaveLength(1)
    expect(css.match(/margin-top:\s*calc\(/g)).toHaveLength(1)
    expect(css).toContain('calc(32rpx*var(--tw-space-y-reverse))')
    expect(css).toContain('calc(32rpx*(1 - var(--tw-space-y-reverse)))')
    expect(css).not.toContain('calc(var(--spacing)*4*0)')
    expect(css).not.toContain('calc(var(--spacing)*4*var(--tw-space-y-reverse))')
    expect(css).not.toContain('calc(var(--spacing)*4*1)')
    expect(css).not.toContain('calc(var(--spacing)*4*(1 - var(--tw-space-y-reverse)))')
  })

  it('keeps equivalent declarations scoped to different nested rules', async () => {
    const cleaner = getCalcDuplicateCleaner({ cssCalc: true } as any)
    const { css } = await postcss([cleaner!]).process(`.parent {
  & .first {
    margin-top: calc((var(--spacing) * 4) * 1);
    margin-top: calc(var(--spacing) * 4 * 1);
  }
  & .second {
    margin-top: calc(var(--spacing) * 4 * 1);
  }
}`, { from: undefined })

    expect(css.match(/margin-top:/g)).toHaveLength(2)
    expect(css).toContain('& .first')
    expect(css).toContain('& .second')
  })

  it('cssCalc 传入 --spacing 示例', async () => {
    const code = `page,
:root {
  --spacing: 8rpx;
}
.h-2 {
  height: calc(var(--spacing) * 2);
}`

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: [
        SPACING_VAR_RE,
      ],
      px2rpx: true,
    })
    const { css } = await styleHandler(code)
    expect(css).toMatchSnapshot()
  })

  it('cssCalc 传入 --spacing 示例 2', async () => {
    const code = `page,
:root {
  --spacing: 8rpx;
}
.h-2 {
  height: calc(var(--spacing) * 2);
}`

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: [
        SPACING_EXACT_RE,
      ],
      px2rpx: true,
    })
    const { css } = await styleHandler(code)
    expect(css).toMatchSnapshot()
  })

  it('Issue #1194: Tailwind v4 spacing 在 :root/:host 中预计算', async () => {
    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: ['--spacing'],
    })
    const { css } = await styleHandler(`:root, :host {
  --spacing: .25rem;
  --other: 2px;
}
.gap-2 { gap: calc(var(--spacing) * 2); }
.p-2 { padding: calc(var(--spacing) * 2); }
.mt-2 { margin-top: calc(var(--spacing) * 2); }
.other { width: calc(var(--other) * 2); }`)
    expect(css).toContain('gap: 0.5rem;')
    expect(css).toContain('padding: 0.5rem;')
    expect(css).toContain('margin-top: 0.5rem;')
    expect(css).toContain('--spacing: .25rem;')
    expect(css).toContain('--other: 2px;')
    expect(css).toContain('width: calc(var(--other)*2);')
  })

  it('移除逻辑简写(margin-inline/padding-inline)展开后交错的 calc 残留', async () => {
    const code = `page,
:root {
  --spacing: 8rpx;
}
.mx-20 {
  margin-inline: calc(var(--spacing) * 20);
}
.px-12 {
  padding-inline: calc(var(--spacing) * 12);
}`

    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssCalc: [
        '--spacing',
      ],
      px2rpx: true,
    })
    const { css } = await styleHandler(code)

    // 字面回退值保留
    expect(css).toContain('margin-left: 160rpx;')
    expect(css).toContain('margin-right: 160rpx;')
    expect(css).toContain('padding-left: 96rpx;')
    expect(css).toContain('padding-right: 96rpx;')
    // 展开后交错的 calc 残留被清除
    expect(css).not.toMatch(/margin-left:\s*calc\(var\(--spacing\)/)
    expect(css).not.toMatch(/margin-right:\s*calc\(var\(--spacing\)/)
    expect(css).not.toMatch(/padding-left:\s*calc\(var\(--spacing\)/)
    expect(css).not.toMatch(/padding-right:\s*calc\(var\(--spacing\)/)
  })
})
