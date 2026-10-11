import postcss from 'postcss'
import { getCustomPropertyCleaner } from '@/plugins/getCustomPropertyCleaner'

const cleaner = getCustomPropertyCleaner({
  cssCalc: {
    includeCustomProperties: ['--spacing'],
  },
} as any)

async function clean(css: string) {
  return postcss([cleaner!]).process(css, { from: undefined })
}

describe('getCustomPropertyCleaner', () => {
  it('保留不同来源的非相邻级联声明', async () => {
    const { css } = await clean(`.demo {
  width: 10px;
  color: red;
  width: calc(var(--spacing) * 2);
}`)

    expect(css).toContain('width: calc(var(--spacing) * 2)')
  })

  it.each([
    `width: 10px;
  color: red;
  width: calc(var(--spacing) * 2) !important;`,
    `width: 10px !important;
  color: red;
  width: calc(var(--spacing) * 2);`,
  ])('保留 important 不一致的级联声明', async (declarations) => {
    const { css } = await clean(`.demo {
  ${declarations}
}`)

    expect(css).toContain('width: calc(var(--spacing) * 2)')
  })

  it('保留紧邻字面量 fallback 后引用目标变量的声明', async () => {
    const { css } = await clean(`.demo {
  width: 16px;
  width: calc(var(--spacing) * 2);
}`)

    expect(css).toContain('width: 16px')
    expect(css).toContain('calc(var(--spacing)')
  })
})
