import { describe, expect, it } from 'vitest'
import { createCssHandlerOptionsCache } from '@/bundlers/vite/css-handler-options'
import { createFrameworkExtraConfiguration } from '@/bundlers/vite/shared/framework-services'
import { createFrameworkStyleAssetContext } from '@/bundlers/vite/shared/framework-style-assets'

describe('框架扩展的配置与缓存边界', () => {
  it('只提供主样式匹配操作，不暴露样式处理配置缓存', () => {
    const cache = createCssHandlerOptionsCache({
      getAppType: () => 'uni-app-x',
      mainCssChunkMatcher: file => file === 'styles/root.css',
      getMajorVersion: () => 4,
    })
    const context = createFrameworkStyleAssetContext({
      bundle: {},
      getCssHandlerOptions: cache.getCssHandlerOptions,
    } as Parameters<typeof createFrameworkStyleAssetContext>[0])
    expect(context).not.toHaveProperty('getCssHandlerOptions')
    expect(context.matchesMainCss('styles/root.css')).toBe(true)
    expect(context.matchesMainCss('styles/component.css')).toBe(false)
    expect(cache.getCssHandlerOptions('styles/root.css').isMainChunk).toBe(true)
  })

  it('冻结配置副本且隔离嵌套属性数组、正则和后续用户变更', () => {
    const cssPreflight = { margin: '0' }
    const matcher = /^t-class$/g
    const attributes = ['class', matcher]
    const configuration = createFrameworkExtraConfiguration({
      cssPreflight,
      cssPreflightRange: 'all',
      customAttributesEntities: [['view', attributes]],
      disabledDefaultTemplateHandler: false,
    })
    expect(Object.isFrozen(cssPreflight)).toBe(false)
    expect(Object.isFrozen(attributes)).toBe(false)
    expect(() => {
      (configuration.cssPreflight as typeof cssPreflight).margin = '1'
    }).toThrow()
    const projectedAttributes = configuration.customAttributesEntities[0]![1] as typeof attributes
    expect(() => projectedAttributes.push('style')).toThrow()
    expect(() => {
      (configuration.customAttributesEntities as unknown[]).push(['text', 'class'])
    }).toThrow()
    cssPreflight.margin = '2'
    attributes.push('className')
    matcher.lastIndex = 4
    expect(configuration.cssPreflight).toEqual({ margin: '0' })
    expect(projectedAttributes).toHaveLength(2)
    expect(projectedAttributes[1]).not.toBe(matcher)
    expect((projectedAttributes[1] as RegExp).lastIndex).toBe(0)
  })
})
