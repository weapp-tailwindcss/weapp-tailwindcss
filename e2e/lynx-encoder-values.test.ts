import type { ExpectedDeclaration } from '../examples/react-lynx/src/compatibility/types'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { encodeLynxCss } from './lynx/batch-encode'
import { matchEncodedDeclaration } from './lynx/encoded-declarations'

function declarations(css: string, selector: string) {
  const result: ExpectedDeclaration[] = []
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector === selector) {
      rule.walkDecls((declaration) => {
        result.push({ property: declaration.prop, value: declaration.value, ...(declaration.important ? { important: true } : {}) })
      })
    }
  })
  return result
}

describe.each([undefined, 'wasm'] as const)('Lynx 生产 %s encoder 的真实值合同', (mode) => {
  const encode = (css: string) => encodeLynxCss(css, { applyCompatibility: false, ...(mode === undefined ? {} : { mode }) })

  it.each([
    ['grid-auto-rows', 'min-content', '24px'],
    ['justify-self', 'flex-end', 'end'],
    ['white-space', 'pre-wrap', 'nowrap'],
  ])('%s 的拒绝值 %s 必须产生空输出，且正向 %s 保留', async (property, rejected, accepted) => {
    const source = `.rejected{${property}:${rejected}}.control{${property}:${accepted}}`
    const encoded = await encode(source)
    expect(encoded.sourceCss).toBe(source)
    expect(encoded.rules.find(rule => rule.selectorText?.value === '.rejected')?.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: property, value: rejected }),
    ]))
    expect(encoded.encodedByteLength).toBeGreaterThan(0)
    // 固定 0.0.49 的 CSSRule 属性值拒绝没有 diagnostic；源输入和空诊断都不能证明保留。
    expect(encoded.diagnostics).toEqual([])
    const actual = declarations(encoded.css, '.rejected')
    expect(actual).toEqual([])
    expect(matchEncodedDeclaration(actual, { property, value: rejected })).toBeUndefined()
    expect(declarations(encoded.css, '.control')).toEqual([{ property, value: accepted }])
  })

  it('单值 transition 时间仅按真实毫秒编码比较，错误数值不得冒充保留', async () => {
    const encoded = await encode('.milliseconds{transition-duration:300ms}.seconds{transition-duration:.3s}')
    expect(encoded.encodedByteLength).toBeGreaterThan(0)
    for (const selector of ['.milliseconds', '.seconds']) {
      const actual = declarations(encoded.css, selector)
      expect(actual).toEqual([{ property: 'transition-duration', value: '300' }])
      expect(matchEncodedDeclaration(actual, { property: 'transition-duration', value: '300ms' })).toEqual(actual)
      expect(matchEncodedDeclaration(actual, { property: 'transition-duration', value: '300s' })).toBeUndefined()
      expect(matchEncodedDeclaration([{ property: 'transition-duration', value: '0.3' }], { property: 'transition-duration', value: '300ms' })).toBeUndefined()
    }
  })

  it('实际编码保留 important；相同颜色缺 important 不能满足独立预期', async () => {
    const encoded = await encode('.important{background-color:#737373!important}.normal{background-color:#737373}')
    expect(encoded.encodedByteLength).toBeGreaterThan(0)
    expect(encoded.diagnostics).toEqual([])
    const expected = { property: 'background-color', value: '#737373', important: true }
    const actual = declarations(encoded.css, '.important')
    expect(actual).toEqual([expected])
    expect(matchEncodedDeclaration(actual, expected)).toEqual(actual)
    expect(matchEncodedDeclaration(declarations(encoded.css, '.normal'), expected)).toBeUndefined()
    expect(matchEncodedDeclaration(actual.map(item => ({ property: item.property, ...(item.value === undefined ? {} : { value: item.value }) })), expected)).toBeUndefined()
  })
})
