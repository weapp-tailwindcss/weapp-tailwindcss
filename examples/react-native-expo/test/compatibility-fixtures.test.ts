import { describe, expect, it } from 'vitest'
import { expectedFixtureStyle, fixtureClassValue, nativeFixtures, styleContains } from '../src/compatibility/protocol'

describe('原生兼容性独立语义夹具', () => {
  it('文字能力由 Text 消费并使用独立单位预期', () => {
    expect(nativeFixtures['type-size']).toMatchObject({ component: 'text', style: { fontSize: 23, lineHeight: 28.75 } })
    expect(nativeFixtures['type-tracking']).toMatchObject({ component: 'text', base: { fontSize: 16 }, style: { letterSpacing: 1.92 } })
    expect(styleContains({ fontSize: 23, lineHeight: 1.25 }, nativeFixtures['type-size']!.style)).toBe(false)
  })

  it('条件包含、排除与恢复均显式定义', () => {
    expect(expectedFixtureStyle('variant-dark', 'light', 'ios')).toEqual({})
    expect(expectedFixtureStyle('variant-dark', 'restored', 'ios')).toEqual({})
    expect(expectedFixtureStyle('variant-dark', 'dark', 'web')).toEqual({ color: '#ffffff' })
    expect(expectedFixtureStyle('variant-dark', 'ios', 'android')).toEqual({})
    expect(expectedFixtureStyle('variant-dark', 'android', 'android')).toEqual({ color: '#123456' })
    expect(expectedFixtureStyle('variant-dark', 'native', 'web')).toEqual({})
    expect(expectedFixtureStyle('variant-dark', 'dark-ios', 'ios')).toEqual({ color: '#123456' })
  })

  it('动态容器、未知 token 与 inline important 各有真实输入', () => {
    expect(fixtureClassValue('dark:text-white', 'variant-dark', 'dynamic-array')).toEqual(['text-[#123456]', false])
    expect(fixtureClassValue('dark:text-white', 'variant-dark', 'dynamic-object')).toEqual({ 'text-[#123456]': true, 'text-[#654321]': false })
    expect(fixtureClassValue('dark:text-white', 'variant-dark', 'unknown-token')).toContain('rn-unknown-token')
    expect(expectedFixtureStyle('variant-dark', 'inline-normal')).toEqual({ color: '#654321' })
    expect(fixtureClassValue('dark:text-white', 'variant-dark', 'inline-important')).toBe('text-[#123456]!')
    expect(expectedFixtureStyle('variant-dark', 'inline-important')).toEqual({ color: '#123456' })
  })
})
