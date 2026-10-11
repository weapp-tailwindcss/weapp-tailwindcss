import { getCompilerContext } from '@/context'
import fs from 'fs-extra'
import path from 'pathe'
import prettier from 'prettier'
import { getCss } from './helpers/getTwCss'
// import { getClassCacheSet } from '@weapp-tailwindcss/engine'
// import fs from 'fs'

async function getClassCacheSet() {
  const ctx = getCompilerContext()
  return ctx.tailwindRuntime.getClassSet()
}

describe('postcss plugin', () => {
  it('base tw output', async () => {
    const res = await getCss('', {
      css: '@tailwind base;@tailwind utilities;',
    })
    expect(res.css.toString()).toMatchSnapshot()
  })

  it('base tw output without prefilight', async () => {
    const res = await getCss('', {
      css: '@tailwind base;@tailwind utilities;',
      twConfig: {
        corePlugins: {
          preflight: false,
        },
      },
    })
    expect(res.css.toString()).toMatchSnapshot()
  })

  it('base utilities output', async () => {
    const res = await getCss('<view class="h-10 w-10 bg-[rgba(255,254,253,.5)]"></view>')
    expect(res.css.toString()).toMatchSnapshot()
  })

  it('downgrades rgb slash syntax for tailwind border colors', async () => {
    const res = await getCss('<view class="border border-blue-600/10"></view>')
    const css = res.css.toString()
    const ctx = getCompilerContext()
    const { css: processed } = await ctx.styleHandler(css, { isMainChunk: true })
    // Tailwind v4 会直接计算出 0.1，因此这里只需确保 slash 写法被降级
    expect(processed).toContain('rgba(21, 93, 252, 0.1)')
    expect(processed).not.toContain('rgb(21 93 252 / 0.1)')

    const { css: manual } = await ctx.styleHandler('.custom{border-color: rgb(37 99 235 / var(--tw-border-opacity));}', {
      isMainChunk: true,
    })
    expect(manual).toContain('rgba(37, 99, 235, var(--tw-border-opacity))')
  })

  it('before:content-[\'+\']', async () => {
    const res = await getCss('<view class="before:content-[\'+\']"></view>')
    expect(res.css.toString()).toMatchSnapshot()
  })

  it('utf-8 compat after:content-[\'我是伪元素\']', async () => {
    const res = await getCss('<view class="after:content-[\'我是伪元素\']')
    expect(res.css.toString()).toMatchSnapshot()
    // fs.writeFileSync('./utf8.css', res.css.toString(), 'utf-8')
  })

  it('@apply space-y/x case', async () => {
    const res = await getCss('<view class="test"></view>', {
      css: '@tailwind utilities;.test{\n@apply space-x-1 space-y-2 text-[#123456];\n font-size:20px}',
    })
    expect(res.css.toString()).toMatchSnapshot()
  })

  it('double quote after class', async () => {
    // after:content-[\"*\"]
    const res = await getCss('<view class="after:content-["对酒当歌，人生几何"]"></view>')
    await getClassCacheSet()
    // const y =
    expect(res.css.toString()).toMatchSnapshot()
  }, 120_000)

  it('single quote after class', async () => {
    // after:content-[\"*\"]
    const res = await getCss('<view class="after:content-[\'对酒当歌，人生几何\']"></view>')
    await getClassCacheSet()

    expect(res.css.toString()).toMatchSnapshot()
  })

  it('dark mode media', async () => {
    // after:content-[\"*\"]
    const res = await getCss('', {
      css: `.tbody {
  .tr {
    @apply border-b border-slate-100 dark:border-slate-400/10;
  }
}`,
    })
    const css = res.css.toString()
    expect(css).toMatchSnapshot()
    const ctx = getCompilerContext()
    const { css: cssRes } = await ctx.styleHandler(css, { isMainChunk: true })
    expect(cssRes).toMatchSnapshot('css')
  })

  it('dark mode class', async () => {
    // after:content-[\"*\"]
    const res = await getCss('', {
      css: `.tbody {
  .tr {
    @apply border-b border-slate-100 dark:border-slate-400/10;
  }
}`,
      twConfig: {
        darkMode: 'class',
      },
    })

    const css = res.css.toString()
    expect(css).toMatchSnapshot()
    const ctx = getCompilerContext()
    const { css: cssRes } = await ctx.styleHandler(css, { isMainChunk: true })
    expect(cssRes).toMatchSnapshot('css')
  })

  it('dark mode selector', async () => {
    // after:content-[\"*\"]
    const res = await getCss('', {
      css: `.tbody {
  .tr {
    @apply border-b border-slate-100 dark:border-slate-400/10;
  }
}`,
      twConfig: {
        darkMode: 'selector',
      },
    })

    const css = res.css.toString()
    expect(css).toMatchSnapshot()
    const ctx = getCompilerContext()
    const { css: cssRes } = await ctx.styleHandler(css, { isMainChunk: true })
    expect(cssRes).toMatchSnapshot('css')
  })

  it('dark mode variant 1', async () => {
    // after:content-[\"*\"]
    const res = await getCss('', {
      css: `.tbody {
  .tr {
    @apply border-b border-slate-100 dark:border-slate-400/10;
  }
}`,
      twConfig: {
        darkMode: ['variant', '&:not(.light *)'],
      },
    })

    const css = res.css.toString()
    expect(css).toMatchSnapshot()
    const ctx = getCompilerContext()
    const { css: cssRes } = await ctx.styleHandler(css, { isMainChunk: true })
    expect(cssRes).toMatchSnapshot('css')
  })

  it('dark mode variant 2', async () => {
    // after:content-[\"*\"]
    const res = await getCss('', {
      css: `.tbody {
  .tr {
    @apply border-b border-slate-100 dark:border-slate-400/10;
  }
}`,
      twConfig: {
        darkMode: ['variant', ['&:is(.dark *)', '@media (prefers-color-scheme: dark) { &:not(.light *) }']],
      },
    })

    const css = res.css.toString()
    expect(css).toMatchSnapshot()
    const ctx = getCompilerContext()
    const { css: cssRes } = await ctx.styleHandler(css, { isMainChunk: true })
    expect(cssRes).toMatchSnapshot('css')
  })

  it('handles taro vite tailwindcss v4 app-origin fixture', async () => {
    const code = await fs.readFile(path.resolve(__dirname, './fixtures/css/taro-vite-react-tailwindcss-v4-app-origin.css'), 'utf8')
    const ctx = getCompilerContext()
    const { css } = await ctx.styleHandler(code, {
      isMainChunk: true,
    })
    expect(await prettier.format(css, { parser: 'css' })).toMatchSnapshot()
  })
})
