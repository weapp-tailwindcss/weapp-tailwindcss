import { expect, it, vi } from 'vitest'
import { postcss } from '../src/postcss-runtime'
import { createCssRuleMatcher, filterExistingCssRules } from '../src/vite-css-rules'

it('reuses a large immutable base while checking multiple independent candidate assets', () => {
  const base = Array.from({ length: 1000 }, (_, index) => `.rule-${index} { color: red; }`).join('\n')
  const parse = vi.spyOn(postcss, 'parse')
  try {
    const matcher = createCssRuleMatcher(base)
    for (let index = 0; index < 20; index++) {
      expect(matcher.contains(`.missing-${index}{color:blue}`)).toBe(false)
      expect(matcher.filter(`.rule-${index}{color:red}.local-${index}{color:blue}`)).toBe(`.local-${index}{color:blue}`)
    }
    // 索引按主样式构建，不能随候选资产数量增长而重复解析。
    expect(parse.mock.calls.filter(([css]) => css === base)).toHaveLength(1)
  }
  finally {
    parse.mockRestore()
  }
})

it('shares one base parse between exact rule and partial declaration filtering', () => {
  const base = '@supports (display:grid){@media screen{.card{color:red!important;display:grid}.card{padding:0}}}.plain{color:var(--color,blue)}'
  const parse = vi.spyOn(postcss, 'parse')
  try {
    const matcher = createCssRuleMatcher(base)
    expect(matcher.filter('@supports (display:grid){@media screen{.card{color:red!important}}}')).toBe('')
    expect(matcher.filter('@supports (display:grid){@media screen{.card{padding:0}}}')).toBe('')
    expect(matcher.filter('@media screen{@supports (display:grid){.card{padding:0}}}')).toContain('padding:0')
    expect(matcher.filter('@supports (display:grid){@media screen{.card{color:red}}}')).toContain('color:red')
    expect(matcher.filter('.plain{color:blue}')).toBe('')
    expect(parse.mock.calls.filter(([css]) => css === base)).toHaveLength(1)
  }
  finally {
    parse.mockRestore()
  }
})

it('retains candidates when the base is invalid without retrying the failed parse', () => {
  const base = '.broken{color:red'
  const parse = vi.spyOn(postcss, 'parse')
  try {
    const matcher = createCssRuleMatcher(base)
    expect(matcher.filter('.one{color:red}')).toBe('.one{color:red}')
    expect(matcher.filter('.two{color:blue}')).toBe('.two{color:blue}')
    expect(parse.mock.calls.filter(([css]) => css === base)).toHaveLength(1)
  }
  finally {
    parse.mockRestore()
  }
})

it('parses the base once for standalone declaration filtering', () => {
  const base = '.card{display:grid;padding:0}'
  const parse = vi.spyOn(postcss, 'parse')
  try {
    expect(filterExistingCssRules(base, '.card{padding:0}.local{color:blue}')).toBe('.local{color:blue}')
    expect(parse.mock.calls.filter(([css]) => css === base)).toHaveLength(1)
  }
  finally {
    parse.mockRestore()
  }
})

it('keeps conditional rules, importance and fallback semantics in a reused matcher', () => {
  const matcher = createCssRuleMatcher('@media (min-width:640px){.card{color:red!important}}.plain{color:var(--color,blue)}')
  expect(matcher.filter('@media (min-width:640px){.card{color:red!important}}')).toBe('')
  expect(matcher.filter('@media (min-width:800px){.card{color:red!important}}')).toBe('@media (min-width:800px){.card{color:red!important}}')
  expect(matcher.filter('.card{color:red}')).toBe('.card{color:red}')
  expect(matcher.filter('.plain{color:blue}')).toBe('')
  expect(matcher.contains('/* only comment */')).toBe(false)
  expect(matcher.filter('.broken{color:red')).toBe('.broken{color:red')
})

it('does not share mutable state between stylesheet revisions', () => {
  const before = createCssRuleMatcher('.card{color:red}')
  const after = createCssRuleMatcher('.card{color:blue}')
  expect(before.contains('.card { color:red }')).toBe(true)
  expect(after.contains('.card { color:red }')).toBe(false)
  expect(after.filter('.card{color:blue}')).toBe('')
  expect(before.filter('.card{color:blue}')).toBe('.card{color:blue}')
})

it('rejects missing rule content without parsing the entire base stylesheet', () => {
  const base = '@media (min-width:640px){.card{color:red}.other{color:blue}}'
  const parse = vi.spyOn(postcss, 'parse')
  try {
    const matcher = createCssRuleMatcher(base)
    expect(matcher.contains(base)).toBe(true)
    expect(matcher.contains('@media (min-width:640px){.card{color:red}.missing{color:blue}}')).toBe(false)
    expect(parse.mock.calls.filter(([css]) => css === base)).toHaveLength(0)
    expect(matcher.contains('@media (min-width:640px){.other{color:blue}.card{color:red}}')).toBe(true)
    expect(matcher.contains('@media (min-width:800px){.other{color:blue}.card{color:red}}')).toBe(false)
    expect(matcher.filter('@media (min-width:640px){.card{color:red}}')).toBe('')
    expect(matcher.filter('@media (min-width:640px){.other{color:blue}}')).toBe('')
    expect(parse.mock.calls.filter(([css]) => css === base)).toHaveLength(1)
  }
  finally {
    parse.mockRestore()
  }
})
