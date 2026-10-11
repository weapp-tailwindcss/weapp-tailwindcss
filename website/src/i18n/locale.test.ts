import { describe, expect, it } from 'vitest'
import { getLocalePrefix, normalizeSiteLocale, stripLocalePrefix, toLocalePath } from './locale'

describe('locale paths', () => {
  it('使用英文作为默认语言并仅为中文添加路径前缀', () => {
    expect(normalizeSiteLocale()).toBe('en')
    expect(normalizeSiteLocale('fr-FR')).toBe('en')
    expect(getLocalePrefix('en')).toBe('')
    expect(getLocalePrefix('zh-cn')).toBe('/zh-cn')
  })

  it('重复执行语言切换时仍返回唯一的规范前缀', () => {
    expect(stripLocalePrefix('/zh-cn/zh-cn/zh-cn')).toBe('/')
    expect(stripLocalePrefix('/zh-cn/zh-cn/docs/intro')).toBe('/docs/intro')
    expect(toLocalePath('/zh-cn/zh-cn/zh-cn', 'en')).toBe('/')
    expect(toLocalePath('/zh-cn/zh-cn/docs/intro', 'en')).toBe('/docs/intro')
    expect(toLocalePath('/zh-cn/zh-cn/docs/intro', 'zh-cn')).toBe('/zh-cn/docs/intro')
  })

  it('规范化重复路径分隔符但不改写普通路径段', () => {
    expect(toLocalePath('//zh-cn///docs//intro', 'zh-cn')).toBe('/zh-cn/docs/intro')
    expect(toLocalePath('/chinese/docs', 'zh-cn')).toBe('/zh-cn/chinese/docs')
  })
})
