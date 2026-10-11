import type { IStyleHandlerOptions } from '@/types'
import { createStyleHandler } from '@/handler'

describe('author plugin stage preserves downstream platform visitors', () => {
  it.each([false, true])('processes every existing node when a separate calc rule is %s', async (withCalc) => {
    const source = [
      ':root{--scale:1rpx}',
      '@media(min-width:1px){.hover\\:p-1:hover{padding:1rem}}',
      '@property --gap{syntax:"<length>";inherits:false;initial-value:1rpx}',
      withCalc ? '.calculated{width:calc(var(--scale)*2)}' : '',
    ].join('')
    const options: Partial<IStyleHandlerOptions> = {
      cssCalc: ['--scale'],
      cssPreflight: false,
      majorVersion: 4,
      rem2rpx: true,
    }
    const expected = await createStyleHandler(options)(source)
    const result = await createStyleHandler({
      ...options,
      postcssOptions: {
        plugins: [{ postcssPlugin: 'author-observer', Declaration() {} }],
      },
    })(source)

    expect(result.css).toBe(expected.css)
    expect(result.css).toContain('page,.tw-root,wx-root-portal-content,:host')
    expect(result.css).toContain('.hover_cp-1:hover')
    expect(result.css).toContain('padding:32rpx')
    expect(result.css).not.toContain('@property')
    if (withCalc) {
      expect(result.css).toContain('width:2rpx')
    }
  })
})
