import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { resolveCssScanSources } from '../src/source-scan/resolve'

describe('CSS 来源策略', () => {
  async function scan(css: string, automatic: 'auto' | 'fallback' | 'disabled', base = '/project') {
    return resolveCssScanSources([{ root: postcss.parse(css), base }], {
      base,
      automatic,
      pattern: '**/*.qxml',
      configResolution: 'path',
    })
  }
  it('正向显式来源保留两种历史默认扫描模式', async () => {
    const css = '@import "tailwindcss"; @source "./pages/**/*.qxml";'
    const fallback = await scan(css, 'fallback')
    const auto = await scan(css, 'auto')
    expect(fallback.entries).toEqual([{ base: '/project/pages', pattern: '**/*.qxml', negated: false }])
    expect(auto.entries).toEqual([{ base: '/project', pattern: '**/*.qxml', negated: false }, ...fallback.entries])
  })
  it('source(none) 与显式禁用均保留给定来源，注释不改变策略', async () => {
    const css = '@import "tailwindcss" source(none); @source "./pages/**/*.qxml";'
    expect((await scan(css, 'auto')).entries).toEqual((await scan(css, 'disabled')).entries)
    expect((await scan('/* source(none) */ @import "tailwindcss";', 'auto')).entries).toHaveLength(1)
    expect((await scan('@import "tailwindcss" source("./pages");', 'disabled')).entries).toEqual([])
  })
  it.each(['/project', 'C:\\project', 'C:\\', '/'])('来源根使用平台路径语义：%s', async (base) => {
    const result = await scan('@import "tailwindcss" source("./中文 pages");', 'fallback', base)
    const windows = base.startsWith('C:')
    expect(result.entries).toEqual([{
      base: windows ? `${base.endsWith('\\') ? base : `${base}\\`}中文 pages` : `${base === '/' ? '' : base}/中文 pages`,
      pattern: '**/*.qxml',
      negated: false,
    }])
  })
  it('仅排除规则根据策略决定是否补充默认根', async () => {
    const css = '@import "tailwindcss"; @source not "./private/**/*.qxml";'
    const fallback = await scan(css, 'fallback')
    expect(fallback.entries.some(entry => !entry.negated)).toBe(true)
    expect((await scan(css.replace('"tailwindcss";', '"tailwindcss" source(none);'), 'fallback')).entries.every(entry => entry.negated)).toBe(true)
  })
})
