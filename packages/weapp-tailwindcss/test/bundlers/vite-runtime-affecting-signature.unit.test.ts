import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRuntimeAffectingSourceSignature } from '@/bundlers/vite/runtime-affecting-signature'
import { babelParse, parseCache } from '@/js/babel/parse'
import * as oxcParser from '@/js/oxc-parser'

describe('bundlers/vite runtime-affecting signature', () => {
  afterEach(() => vi.restoreAllMocks())
  it('keeps html comment content in runtime-affecting signature', () => {
    const first = createRuntimeAffectingSourceSignature(
      '<view class="card"></view><!-- text-[#123456] -->',
      'html',
    )
    const second = createRuntimeAffectingSourceSignature(
      '<view class="card"></view><!-- text-[#654321] -->',
      'html',
    )

    expect(first).not.toBe(second)
    expect(first).toContain('c: text-[#123456] ')
    expect(second).toContain('c: text-[#654321] ')
  })

  it('keeps js comment content in runtime-affecting signature', () => {
    const first = createRuntimeAffectingSourceSignature(
      'const cls = "card"\n/* text-[#123456] */',
      'js',
    )
    const second = createRuntimeAffectingSourceSignature(
      'const cls = "card"\n/* text-[#654321] */',
      'js',
    )

    expect(first).not.toBe(second)
    expect(first).toContain('c: text-[#123456] ')
    expect(second).toContain('c: text-[#654321] ')
  })

  it('does not retain a Babel AST for signature-only analysis of large generated chunks', () => {
    parseCache.clear()
    const source = Array.from({ length: 1000 }, (_, index) => `const cls${index} = "w-[${index}px]"`).join('\n')

    const signature = createRuntimeAffectingSourceSignature(source, 'js')

    expect(signature).toContain('s:w-[0px]')
    expect(signature).toContain('s:w-[999px]')
    expect(parseCache.size).toBe(0)
  })

  it('falls back to the cached Babel parser when the native parser is unavailable', () => {
    const parse = vi.spyOn(oxcParser, 'parseOxcSync').mockReturnValue(undefined)
    parseCache.clear()
    const source = 'const cls = "card"'

    expect(createRuntimeAffectingSourceSignature(source, 'js')).toBe('s:card')
    expect(parse).toHaveBeenCalledOnce()
    expect(parseCache.size).toBe(1)
    const cached = babelParse(source, {
      cache: true,
      cacheKey: 'st:unambiguous',
      sourceType: 'unambiguous',
    })

    expect(parseCache.size).toBe(1)
    expect(babelParse(source, {
      cache: true,
      cacheKey: 'st:unambiguous',
      sourceType: 'unambiguous',
    })).toBe(cached)
  })

  it('keeps JSX, escaped strings, nested templates, TS literals and comments', () => {
    const source = [
      'type Size = "w-[3rpx]"',
      'const value = "w-\\u005b1rpx\\u005d"',
      // eslint-disable-next-line no-template-curly-in-string -- 被测源码需要保留模板插值。
      'const text = `p-[2px] ${active ? `m-[3px]` : "gap-[4px]"}`',
      'const view = <view className="h-[5px]"> bg-[red] </view>',
      '// text-[6px]',
    ].join('\n')
    const signature = createRuntimeAffectingSourceSignature(source, 'js')

    for (const text of ['s:w-[3rpx]', 's:w-[1rpx]', 't:p-[2px] ', 't:m-[3px]', 's:gap-[4px]', 's:h-[5px]', 'x:bg-[red]', 'c: text-[6px]']) {
      expect(signature).toContain(text)
    }
    expect(createRuntimeAffectingSourceSignature(source.replace('m-[3px]', 'm-[7px]'), 'js')).not.toBe(signature)
  })

  it('falls back to Babel if the native parser throws', () => {
    const parse = vi.spyOn(oxcParser, 'parseOxcSync').mockImplementation(() => {
      throw new Error('native parser unavailable')
    })
    expect(createRuntimeAffectingSourceSignature('const cls = "w-[3rpx]"', 'js')).toBe('s:w-[3rpx]')
    expect(parse).toHaveBeenCalledOnce()
  })

  it('skips js parser work when source has no runtime-affecting text hint', () => {
    parseCache.clear()

    const signature = createRuntimeAffectingSourceSignature(
      'let count = 1 + 2\ncount++\nexport { count }',
      'js',
    )

    expect(signature).toBe('')
    expect(parseCache.size).toBe(0)
  })

  it('uses a lightweight js text signature without depending on quote style', () => {
    const first = createRuntimeAffectingSourceSignature('const cls = "text-[#123456]"', 'js')
    const second = createRuntimeAffectingSourceSignature('const cls = \'text-[#123456]\'', 'js')

    expect(first).toBe(second)
  })

  it('keeps template expression string content in js signature', () => {
    const first = createRuntimeAffectingSourceSignature(
      // eslint-disable-next-line no-template-curly-in-string -- 被测源码需要保留模板插值。
      'const cls = `card ${active ? "text-[#123456]" : "text-[#111111]"}`',
      'js',
    )
    const second = createRuntimeAffectingSourceSignature(
      // eslint-disable-next-line no-template-curly-in-string -- 被测源码需要保留模板插值。
      'const cls = `card ${active ? "text-[#654321]" : "text-[#111111]"}`',
      'js',
    )

    expect(first).not.toBe(second)
    expect(first).toContain('s:text-[#123456]')
    expect(second).toContain('s:text-[#654321]')
  })

  it('ignores formatting-only html/js noise in runtime-affecting signature', () => {
    const htmlA = createRuntimeAffectingSourceSignature('<view class="card">hello</view>', 'html')
    const htmlB = createRuntimeAffectingSourceSignature('<view   class="card">\n  hello\n</view>', 'html')
    const jsA = createRuntimeAffectingSourceSignature('const cls = "card"\nexport { cls }\n', 'js')
    const jsB = createRuntimeAffectingSourceSignature('const cls = "card";\n\nexport { cls }\n', 'js')
    const cssA = createRuntimeAffectingSourceSignature('.card { color: red; }\n/* note */\n.page { padding: 8px; }', 'css')
    const cssB = createRuntimeAffectingSourceSignature('.card{color:red}.page{padding:8px}', 'css')

    expect(htmlA).toBe(htmlB)
    expect(jsA).toBe(jsB)
    expect(cssA).toBe(cssB)
  })

  it('keeps css value changes in runtime-affecting signature', () => {
    const first = createRuntimeAffectingSourceSignature('.card { color: red; }', 'css')
    const second = createRuntimeAffectingSourceSignature('.card { color: blue; }', 'css')

    expect(first).not.toBe(second)
  })

  it.each([
    ['.a { content: "a  b" }', '.a { content: "a b" }'],
    ['.a { content: "/* visible */" }', '.a { content: "" }'],
    ['.a :hover { color: red }', '.a:hover { color: red }'],
  ])('preserves meaningful CSS differences: %s', (previous, next) => {
    expect(createRuntimeAffectingSourceSignature(previous, 'css'))
      .not
      .toBe(createRuntimeAffectingSourceSignature(next, 'css'))
  })

  it('falls back to raw source when js parsing fails', () => {
    const source = 'const broken ='
    expect(createRuntimeAffectingSourceSignature(source, 'js')).toBe(source)
  })
})
