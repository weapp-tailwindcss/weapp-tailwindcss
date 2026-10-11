import { scss as scssParser } from '@weapp-tailwindcss/postcss'
import { createContext } from '@/core'

describe('core', () => {
  it('common usage case 0', async () => {
    const ctx = createContext()
    const wxml = await ctx.transformWxml('<view class="mt-[8px]" wx:if="{{ xxx.length > 0 }}">')
    expect(wxml).toBe('<view class="mt-_b8px_B" wx:if="{{ xxx.length > 0 }}">')
    const { css: wxss, map: cssMap } = await ctx.transformWxss(`.after\\:ml-0\\.5::after {
      content: var(--tw-content);
      margin-left: 0.125rem;
    }`)
    expect(wxss).toBe(`.after_cml-0_d5::after {
      content: var(--tw-content);
      margin-left: 0.125rem;
    }
view,text,::after,::before {
      --tw-content: "";
}`)
    expect(cssMap).toMatchSnapshot()
    const content = `const className = 'mb-[1.5rem]'`

    const { code, map } = await ctx.transformJs(content, {
      runtimeSet: new Set(['mb-[1.5rem]']),
    })
    expect(code).toBe(`const className = 'mb-_b1_d5rem_B'`)
    expect(map).toMatchSnapshot()
  }, 120_000)

  it('common usage case 1', async () => {
    const ctx = createContext()
    const wxml = await ctx.transformWxml('<view class="mt-[8px]" wx:if="{{ xxx.length > 0 }}">')
    expect(wxml).toBe('<view class="mt-_b8px_B" wx:if="{{ xxx.length > 0 }}">')
    const { css, map: cssMap } = await ctx.transformWxss(`.after\\:ml-0\\.5::after {
      content: var(--tw-content);
      margin-left: 0.125rem;
    }`)
    expect(css).toBe(`.after_cml-0_d5::after {
      content: var(--tw-content);
      margin-left: 0.125rem;
    }
view,text,::after,::before {
      --tw-content: "";
}`)
    expect(cssMap).toMatchSnapshot()
    const content = `const className = 'mb-[1.5rem]'`
    const runtimeSet = new Set<string>()
    const { code, map } = await ctx.transformJs(content, { runtimeSet })
    expect(code).toBe(`const className = 'mb-[1.5rem]'`)
    expect(map).toMatchSnapshot()
  }, 120_000)

  it('scss usage case 1', async () => {
    const ctx = createContext()
    const wxml = await ctx.transformWxml('<view class="mt-[8px]" wx:if="{{ xxx.length > 0 }}">')
    expect(wxml).toBe('<view class="mt-_b8px_B" wx:if="{{ xxx.length > 0 }}">')
    const { css: wxss } = await ctx.transformWxss(`// xx`, {
      isMainChunk: true,
      postcssOptions: {
        options: {
          parser: scssParser,
        },
      },
    })
    expect(wxss).toBe(`/* xx*/`)
    const content = `const className = 'mb-[1.5rem]'`
    const runtimeSet = new Set<string>()
    const { code, map } = await ctx.transformJs(content, { runtimeSet })
    expect(code).toBe(`const className = 'mb-[1.5rem]'`)
    expect(map).toMatchSnapshot()
  }, 120_000)
})

describe('core transform functions', () => {
  it('should transform WXML with runtimeSet', async () => {
    const ctx = createContext()
    const rawWxml = '<view class="mt-[8px]" wx:if="{{ xxx.length > 0 }}">'
    const runtimeSet = new Set(['mt-[8px]'])
    const options = { runtimeSet }
    const transformedWxml = await ctx.transformWxml(rawWxml, options)
    expect(transformedWxml).toBe('<view class="mt-_b8px_B" wx:if="{{ xxx.length > 0 }}">')
  })

  it('should transform JS with runtimeSet', async () => {
    const ctx = createContext()
    const rawJs = `const className = 'mb-[1.5rem]'`
    const runtimeSet = new Set(['mb-[1.5rem]'])
    const options = { runtimeSet }
    const { code } = await ctx.transformJs(rawJs, options)
    expect(code).toBe(`const className = 'mb-_b1_d5rem_B'`)
  })

  it('keeps API path string unchanged even when runtimeSet contains the same value', async () => {
    const ctx = createContext()
    const rawJs = `call_api("order/get_order_amount", {}, "POST")`
    const runtimeSet = new Set(['order/get_order_amount'])

    const { code } = await ctx.transformJs(rawJs, { runtimeSet })

    expect(code).toBe(rawJs)
  })

  it('transforms real classes while keeping polluted API, route and asset paths unchanged', async () => {
    const ctx = createContext()
    const rawJs = [
      `const className = "text-[12px] w-1/2"`,
      `call_api("order/get_order_amount", {}, "POST")`,
      `const route = "pages/order/detail"`,
      `const asset = "static/icon-home.svg"`,
    ].join('\n')
    const runtimeSet = new Set([
      'text-[12px]',
      'w-1/2',
      'order/get_order_amount',
      'pages/order/detail',
      'static/icon-home.svg',
    ])

    const { code } = await ctx.transformJs(rawJs, { runtimeSet })

    expect(code).toContain(`const className = "text-_b12px_B w-1_f2"`)
    expect(code).toContain(`call_api("order/get_order_amount", {}, "POST")`)
    expect(code).toContain(`const route = "pages/order/detail"`)
    expect(code).toContain(`const asset = "static/icon-home.svg"`)
  })

  it('should handle empty runtimeSet', async () => {
    const ctx = createContext()
    const rawWxml = '<view class="mt-[8px]" wx:if="{{ xxx.length > 0 }}">'
    const runtimeSet = new Set<string>()

    const transformedWxml = await ctx.transformWxml(rawWxml, {
      runtimeSet,
    })
    expect(transformedWxml).toBe('<view class="mt-_b8px_B" wx:if="{{ xxx.length > 0 }}">')
  })
})

describe('core hot update class escaping', () => {
  it('keeps newly added arbitrary class in js unchanged when runtimeSet is stale', async () => {
    const ctx = createContext()

    await ctx.transformJs(`const initial = ['text-[12px]']`, {
      runtimeSet: new Set(['text-[12px]']),
    })

    const { code } = await ctx.transformJs(`const classNames = ['text-[23.43px]']`)
    expect(code).toBe(`const classNames = ['text-[23.43px]']`)
  })

  it('keeps newly added dotted utility class in js unchanged when runtimeSet is stale', async () => {
    const ctx = createContext()

    await ctx.transformJs(`const initial = ['space-y-2']`, {
      runtimeSet: new Set(['space-y-2']),
    })

    const { code } = await ctx.transformJs(`const classNames = ['space-y-2.5']`)
    expect(code).toBe(`const classNames = ['space-y-2.5']`)
  })

  it('keeps newly added arbitrary class in wxml expression unchanged when runtimeSet is stale', async () => {
    const ctx = createContext()

    const transformed = await ctx.transformWxml(
      `<view class="{{ isLarge ? 'text-[23.43px]' : 'text-[12px]' }}"></view>`,
      {
        runtimeSet: new Set(['text-[12px]']),
      },
    )

    expect(transformed).toContain('text-[23.43px]')
    expect(transformed).toContain('text-_b12px_B')
  })

  it('keeps newly added dotted utility class in wxml expression unchanged when runtimeSet is stale', async () => {
    const ctx = createContext()

    const transformed = await ctx.transformWxml(
      `<view class="{{ isLarge ? 'space-y-2.5' : 'space-y-2' }}"></view>`,
      {
        runtimeSet: new Set(['space-y-2']),
      },
    )

    expect(transformed).toContain('space-y-2.5')
    expect(transformed).toContain('space-y-2')
  })

  it('transforms arbitrary class in vue-like template class attribute', async () => {
    const ctx = createContext()
    const transformed = await ctx.transformWxml('<view class="text-[23.43px]"></view>', {
      runtimeSet: new Set(['text-[12px]']),
    })

    expect(transformed).toBe('<view class="text-_b23_d43px_B"></view>')
  })
})
