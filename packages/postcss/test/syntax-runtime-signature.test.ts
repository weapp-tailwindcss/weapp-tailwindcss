import { describe, expect, it } from 'vitest'
import { createCssRuntimeAffectingSignature as signature } from '../src/syntax/runtime-signature'

describe('CSS runtime signature', () => {
  it.each([
    ['', ' /* comment */ '],
    ['.a { color: red; }', '.a{color:red}'],
    ['@media screen { .a { color: red; } }', '@media screen{.a{color:red}}'],
    ['@theme { --color-brand: red; }', '/* banner */\n@theme{--color-brand:red}'],
  ])('ignores structural formatting: %s', (left, right) => {
    expect(signature(left)).toBe(signature(right))
  })

  it.each([
    ['.a{content:"a  b"}', '.a{content:"a b"}'],
    ['.a{content:"/* text */"}', '.a{content:""}'],
    ['.a{content:"a : b"}', '.a{content:"a:b"}'],
    ['.a :hover{color:red}', '.a:hover{color:red}'],
    ['.a :is(.b){color:red}', '.a:is(.b){color:red}'],
    ['.a{color:red}', '.a{color:red!important}'],
    ['.a{*color:red}', '.a{color:red}'],
    ['.a{_color:red}', '.a{color:red}'],
    ['.a{--x:foo/**/bar}', '.a{--x:foobar}'],
    ['.a{--x:foo /**/ bar}', '.a{--x:foo bar}'],
    ['.a{background:url(a/*b*/c)}', '.a{background:url(ac)}'],
    ['@layer utilities;', '@layer utilities{}'],
    ['@theme{--font-label:"A  B"}', '@theme{--font-label:"A B"}'],
    ['.a{--x: ;}', '.a{--x:;}'],
    [String.raw`.a\:hover{color:red}`, '.a:hover{color:red}'],
    ['.a{color:red;color:blue}', '.a{color:blue;color:red}'],
  ])('preserves token content and structure: %s', (left, right) => {
    expect(signature(left)).not.toBe(signature(right))
  })

  it('keeps invalid sources distinct without throwing', () => {
    const first = '.a { content: "broken'
    const second = '.a { content: "broken  '
    expect(() => signature(first)).not.toThrow()
    expect(signature(first)).not.toBe(signature(second))
    expect(signature(first)).toBe(signature(first))
  })
})
