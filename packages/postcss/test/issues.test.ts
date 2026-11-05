import type postcss from 'postcss'
import { generateCss4 } from '@weapp-tailwindcss/test-helper'
import autoprefixer from 'autoprefixer'
import path from 'pathe'
import { createStyleHandler } from '@/index'

async function generateCss(base: string, plugins: readonly postcss.AcceptedPlugin[] = []) {
  return await generateCss4(base, {
    postcssPlugins: [...plugins],
  })
}

describe('issues', () => {
  it('https://github.com/sonofmagic/weapp-tailwindcss/issues/631', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/631'))
    expect(code.css).toMatchSnapshot()
    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code.css, {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })
  it('https://github.com/sonofmagic/weapp-tailwindcss/issues/632', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/632'))
    expect(code.css).toMatchSnapshot()
    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code.css, {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })

  it('https://github.com/sonofmagic/weapp-tailwindcss/issues/638', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/638'))
    expect(code.css).toMatchSnapshot()
    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code.css, {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })

  it('https://github.com/sonofmagic/weapp-tailwindcss/issues/638 case 0', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/638-0'))
    expect(code.css).toMatchSnapshot()
    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code.css, {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })

  it('https://github.com/sonofmagic/weapp-tailwindcss/issues/643', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/643'))
    expect(code.css).toMatchSnapshot()
    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code.css, {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })

  it('https://github.com/sonofmagic/weapp-tailwindcss/issues/652', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/652'))
    expect(code.css).toMatchSnapshot()
    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code.css, {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })

  it('https://github.com/sonofmagic/weapp-tailwindcss/issues/909', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/909'))
    expect(code.css).toContain('transform: var(--tw-rotate-x, ) var(--tw-rotate-y, ) var(--tw-rotate-z, ) var(--tw-skew-x, ) var(--tw-skew-y, );')
    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code.css, {
      isMainChunk: true,
    })
    expect(css).toContain('transform: var(--tw-rotate-x, ) var(--tw-rotate-y, ) var(--tw-rotate-z, ) var(--tw-skew-x, ) var(--tw-skew-y, );')
    expect(css).not.toContain('transform: var(--tw-rotate-x,) var(--tw-rotate-y,)')
    expect(css).toMatchSnapshot()
  })

  it.each([',', ', '])('keeps issue 909 empty transform fallbacks valid for the upstream separator %j', async (separator) => {
    const variables = ['rotate-x', 'rotate-y', 'rotate-z', 'skew-x', 'skew-y']
    const transform = variables.map(name => `var(--tw-${name}${separator})`).join(' ')
    const styleHandler = createStyleHandler({ isMainChunk: true, majorVersion: 4 })
    const { css } = await styleHandler(`.rotate { transform: ${transform}; }`)
    expect(css).toContain('transform: var(--tw-rotate-x, ) var(--tw-rotate-y, ) var(--tw-rotate-z, ) var(--tw-skew-x, ) var(--tw-skew-y, );')
    expect(css).not.toContain('var(--tw-rotate-x,)')
  })

  it('https://github.com/sonofmagic/weapp-tailwindcss/issues/928', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/928'))
    expect(code.css).toContain('background-image: linear-gradient(var(--tw-gradient-stops));')
    expect(code.css).toContain('var(--tw-gradient-from) var(--tw-gradient-from-position)')
    expect(code.css).not.toContain('var(--tw-gradient-from-position,)')
    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code.css, {
      isMainChunk: true,
    })

    expect(css).toContain('background-image: linear-gradient(var(--tw-gradient-stops));')
    expect(css).toContain('.bg-linear-to-r {')
    expect(css).not.toContain('.bg-linear-to-r.from-cyan-500.to-blue-500')
    expect(css).toMatch(/\.bg-linear-to-r\s*\{\s*--tw-gradient-position:\s*to right;\s*background-image:\s*linear-gradient/)
    expect(css).toContain('--tw-gradient-stops: var(--tw-gradient-via-stops, var(--tw-gradient-position)),')
    expect(css).toContain('var(--tw-gradient-from) var(--tw-gradient-from-position, )')
    expect(css).toContain('var(--tw-gradient-to) var(--tw-gradient-to-position, )')
    expect(css).not.toContain('var(--tw-gradient-from-position,),')
    expect(css).not.toContain('var(--tw-gradient-to-position,),')
    expect(css).not.toContain('var(--tw-gradient-from-position),')
    expect(css).not.toContain('var(--tw-gradient-to-position);')
    expect(css).not.toContain('to right in oklab')
    expect(css).not.toContain('--tw-gradient-via-stops: initial')
    expect(css).toMatchSnapshot()
  })

  it('https://github.com/sonofmagic/weapp-tailwindcss/issues/715', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/715-space-y-4'))
    expect(code.css).toMatchSnapshot()
    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code.css, {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })

  it('https://github.com/sonofmagic/weapp-tailwindcss/issues/726', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/726'))
    expect(code.css).toMatchSnapshot()
    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code.css, {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })

  it('https://github.com/sonofmagic/weapp-tailwindcss/issues/695', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/695'))
    expect(code.css).toMatchSnapshot()
    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code.css, {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })
  // https://developer.mozilla.org/en-US/docs/Web/CSS/calc-keyword
  it('https://github.com/sonofmagic/weapp-tailwindcss/issues/695 taro rpx case', async () => {
    const code = `.rounded-full {
  border-radius: calc(infinity * 1rpx);
  border-radius: calc(infinity * 5px);
  border-radius: calc(infinity * 3.14rpx);
  border-radius: calc(infinity * .6px);
  border-radius: calc(infinity * 100.px);
  border-radius: calc(infinity * 100.1px);
}
`

    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code, {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })

  it('tailwindcss@4 text/* heuristics should not treat headers as classes', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/text-event-stream'))
    expect(code.css).toMatchSnapshot()
    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code.css, {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })

  it('space-x-number', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/space-x-number'), [autoprefixer({
      add: true,
      env: 'ie 11',
    })])
    expect(code.css).toMatchSnapshot()
    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code.css, {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })

  it('cssSelectorReplacement case 0', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/space-x-number'))
    expect(code.css).toMatchSnapshot()
    const styleHandler = createStyleHandler({
      isMainChunk: true,
      cssSelectorReplacement: {
        root: ['page', 'wx-root-content'],
      },
    })
    const { css } = await styleHandler(code.css)
    expect(css).toMatchSnapshot()
  })

  it('custom case 0', async () => {
    const code = await generateCss(path.resolve(__dirname, './fixtures/issues/custom'))
    expect(code.css).toMatchSnapshot()
    const styleHandler = createStyleHandler({
      isMainChunk: true,
    })
    const { css } = await styleHandler(code.css)
    expect(css).toMatchSnapshot()
  })
})
