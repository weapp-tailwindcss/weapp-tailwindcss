import selectorParser from 'postcss-selector-parser'
import { afterEach, expect, it, vi } from 'vitest'
import { createSelectorClassReader } from '../src/utils/css-selector-classes'
import { annotateCssTokenSources, collectCssTokenSourceTraceEdits } from '../src/utils/css-source-trace'

afterEach(() => {
  vi.restoreAllMocks()
})

it('多个资产及重建只解析一次相同完整选择器，来源仍使用当前映射', () => {
  const parse = vi.spyOn(Object.getPrototypeOf(selectorParser()), 'astSync')
  const selector = String.raw`:is(.cache\:h-\[137px\], [data-fake=".fake"], .neighbor)`
  const css = Array.from({ length: 100 }, (_, i) => `${selector}{z-index:${i}}`).join('')
  const sources = (file: string) => new Map([
    ['cache:h-[137px]', { token: 'cache:h-[137px]', sources: [file] }],
    ['fake', { token: 'fake', sources: ['wrong.vue'] }],
  ])
  const first = annotateCssTokenSources(css, sources('first.vue'))
  expect(first.match(/cache:h-\[137px\] <= first.vue/g)).toHaveLength(100)
  expect(first).not.toContain('wrong.vue')
  expect(parse).toHaveBeenCalledTimes(1)
  const second = annotateCssTokenSources(css, sources('second.vue'))
  expect(second).toContain('second.vue')
  expect(second).not.toContain('first.vue')
  expect(collectCssTokenSourceTraceEdits(css, sources('second.vue'))).toHaveLength(100)
  expect(parse).toHaveBeenCalledTimes(1)
})

it('变更选择器重新解析，不能复用已删除class的来源', () => {
  const parse = vi.spyOn(Object.getPrototypeOf(selectorParser()), 'astSync')
  const sources = new Map([
    ['old-cache-token', { token: 'old-cache-token', sources: ['old.vue'] }],
    ['new-cache-token', { token: 'new-cache-token', sources: ['new.vue'] }],
  ])
  expect(annotateCssTokenSources('.old-cache-token{color:red}', sources)).toContain('old.vue')
  const changed = annotateCssTokenSources('.new-cache-token{color:red}', sources)
  expect(changed).toContain('new.vue')
  expect(changed).not.toContain('old.vue')
  expect(parse).toHaveBeenCalledTimes(2)
})

it('来源Map和数组原位更新、删除后只查询本轮映射', () => {
  const files = ['first.vue']
  const sources = new Map([['mutable-source', { token: 'mutable-source', sources: files }]])
  const css = '.mutable-source{color:red}'
  expect(annotateCssTokenSources(css, sources)).toContain('first.vue')
  files.splice(0, 1, 'second.vue')
  const second = annotateCssTokenSources(css, sources)
  expect(second).toContain('second.vue')
  expect(second).not.toContain('first.vue')
  sources.set('mutable-source', { token: 'replaced', sources: ['third.vue'] })
  expect(annotateCssTokenSources(css, sources)).toContain('replaced <= third.vue')
  sources.delete('mutable-source')
  sources.set('unrelated', { token: 'unrelated', sources: ['wrong.vue'] })
  expect(annotateCssTokenSources(css, sources)).toBe(css)
  expect(collectCssTokenSourceTraceEdits(second, sources)).toHaveLength(1)
  expect(collectCssTokenSourceTraceEdits(second, sources)[0]?.text).toBe('')
})

it('条目与字符上限均淘汰最久未使用项，超长选择器不驻留', () => {
  const parse = vi.spyOn(Object.getPrototypeOf(selectorParser()), 'astSync')
  const read = createSelectorClassReader({ maxEntries: 2, maxCharacters: 100 })
  read('.a')
  read('.b')
  read('.a')
  read('.c')
  read('.a')
  expect(parse).toHaveBeenCalledTimes(3)
  read('.b')
  expect(parse).toHaveBeenCalledTimes(4)

  const limited = createSelectorClassReader({ maxEntries: 10, maxCharacters: 8 })
  limited('.x')
  limited('.yy')
  limited('.x')
  expect(parse).toHaveBeenCalledTimes(7)
  const long = `.${'z'.repeat(100)}`
  expect(limited(long)).toEqual([{ value: 'z'.repeat(100), raw: 'z'.repeat(100) }])
  limited(long)
  expect(parse).toHaveBeenCalledTimes(9)
  limited('.x')
  expect(parse).toHaveBeenCalledTimes(9)
})

it('解析失败不产生部分来源，缓存不暴露可变 AST 或 token', () => {
  const read = createSelectorClassReader()
  expect(read('.valid:is(')).toEqual([])
  const result = read(String.raw`.escaped\:token`)
  expect(result).toEqual([{ value: 'escaped:token', raw: String.raw`escaped\:token` }])
  expect(Object.isFrozen(result)).toBe(true)
  expect(Object.isFrozen(result[0])).toBe(true)
  expect(annotateCssTokenSources('.valid:is({color:red}', new Map([
    ['valid', { token: 'valid', sources: ['wrong.vue'] }],
  ]))).not.toContain('wrong.vue')
})
