import type { ExpectedDeclaration } from '../examples/react-lynx/src/compatibility/types'
import { describe, expect, it } from 'vitest'
import { matchEncodedDeclaration } from './lynx/encoded-declarations'

const declaration = (property: string, value: string, important?: boolean): ExpectedDeclaration => ({ property, value, ...(important ? { important } : {}) })
const sides = ['top', 'right', 'bottom', 'left']
const padding = sides.map(side => declaration(`padding-${side}`, '13px'))
const radius = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map(corner => declaration(`border-${corner}-radius`, '18px'))
const animation = [
  declaration('animation-name', 'spin'),
  declaration('animation-duration', '1000'),
  declaration('animation-timing-function', '[linear]'),
  declaration('animation-iteration-count', '1000000000'),
  declaration('animation-delay', '0'),
  declaration('animation-direction', 'normal'),
  declaration('animation-fill-mode', 'none'),
  declaration('animation-play-state', 'running'),
]
const animationExpected = declaration('animation', 'spin 1s linear infinite')

describe('Lynx 实际编码声明的有限语义比较', () => {
  it.each([
    [padding, declaration('padding', '13px')],
    [radius, declaration('border-radius', '18px')],
    [sides.map(side => declaration(`border-${side}-style`, 'solid')), declaration('border-style', 'solid')],
    [sides.map(side => declaration(`border-${side}-color`, '#16a34a')), declaration('border-color', '#16a34a')],
    [[declaration('row-gap', '0.5rem'), declaration('column-gap', '0.5rem')], declaration('gap', '0.5rem')],
    [[declaration('row-gap', '1px'), declaration('column-gap', '2px')], declaration('gap', '1px 2px')],
    [[declaration('flex-grow', '1'), declaration('flex-shrink', '1'), declaration('flex-basis', '0')], declaration('flex', '1 1 0')],
    [[declaration('grid-column-span', '2')], declaration('grid-column', 'span 2 / span 2')],
    [[declaration('grid-row-span', '2')], declaration('grid-row', 'span 2 / span 2')],
    [[declaration('aspect-ratio', '1.333333')], declaration('aspect-ratio', '4/3')],
    [[declaration('background-position', 'center center')], declaration('background-position', 'center')],
    [[declaration('background-repeat', 'no-repeat no-repeat')], declaration('background-repeat', 'no-repeat')],
    [[declaration('background-image', 'radial-gradient(circle farthest-corner at 20% 20% ,#ffffff ,#000000)')], declaration('background-image', 'radial-gradient(circle at 20% 20%,#fff,#000)')],
    [[declaration('transform-origin', '[0,2,0,2]')], declaration('transform-origin', '0 0')],
    [animation, animationExpected],
  ] as Array<[ExpectedDeclaration[], ExpectedDeclaration]>)('只返回实际声明作为 %j 的语义证据', (actual, expected) => {
    const evidence = matchEncodedDeclaration(actual, expected)
    expect(evidence).toEqual(actual)
    evidence!.forEach((item, index) => expect(item).toBe(actual[index]))
  })

  it.each(Array.from({ length: 4 }, (_, index) => index))('缺少第 %i 边或角不能由其余声明补齐', (index) => {
    expect(matchEncodedDeclaration(padding.filter((_, position) => position !== index), declaration('padding', '13px'))).toBeUndefined()
    expect(matchEncodedDeclaration(radius.filter((_, position) => position !== index), declaration('border-radius', '18px'))).toBeUndefined()
  })

  it('四值 shorthand 保留 CSS 的上右下左和四角顺序', () => {
    const actual = sides.map((side, index) => declaration(`padding-${side}`, `${index + 1}px`))
    expect(matchEncodedDeclaration(actual, declaration('padding', '1px 2px 3px 4px'))).toEqual(actual)
    expect(matchEncodedDeclaration(actual, declaration('padding', '1px 4px 3px 2px'))).toBeUndefined()
  })

  it.each([
    [[...padding.slice(0, 3), declaration('padding-left', '13rem')], declaration('padding', '13px')],
    [[declaration('row-gap', '0.5rem'), declaration('column-gap', '0.5px')], declaration('gap', '0.5rem')],
    [[declaration('aspect-ratio', '1.334')], declaration('aspect-ratio', '4/3')],
    [[declaration('aspect-ratio', '1.333333px')], declaration('aspect-ratio', '4/3')],
    [[declaration('aspect-ratio', '1.333333')], declaration('aspect-ratio', '4/0')],
    [[declaration('background-position', '20% 30%')], declaration('background-position', 'center')],
    [[declaration('background-repeat', 'no-repeat repeat')], declaration('background-repeat', 'no-repeat')],
    [[declaration('background-image', 'radial-gradient(circle farthest-corner at 20% 30%,#ffffff,#000000)')], declaration('background-image', 'radial-gradient(circle at 20% 20%,#fff,#000)')],
    [[declaration('background-image', 'radial-gradient(circle farthest-corner at 20% 20%,#ffffff,#ff0000)')], declaration('background-image', 'radial-gradient(circle at 20% 20%,#fff,#000)')],
    [[declaration('background-image', 'radial-gradient(ellipse at 20% 20%,#ffffff,#000000)')], declaration('background-image', 'radial-gradient(circle at 20% 20%,#fff,#000)')],
    [[declaration('transform-origin', '[0,11,0,11]')], declaration('transform-origin', '0 0')],
    [[declaration('transform-origin', '[0,2,0]')], declaration('transform-origin', '0 0')],
    [[declaration('transform-origin', '[0,2,1,2]')], declaration('transform-origin', '0 0')],
    [[declaration('grid-column-start', '2')], declaration('grid-column', 'span 2 / span 2')],
    [[declaration('grid-column-span', '1')], declaration('grid-column', 'span 2 / span 2')],
    [[declaration('grid-column-span', '2')], declaration('grid-column', 'span 2 / span 3')],
    [[declaration('flex-grow', '1'), declaration('flex-shrink', '1')], declaration('flex', '1 1 0')],
    [[declaration('flex-grow', '1'), declaration('flex-shrink', '0'), declaration('flex-basis', '0')], declaration('flex', '1 1 0')],
  ] as Array<[ExpectedDeclaration[], ExpectedDeclaration]>)('错误或部分编码 %j 不得匹配独立预期', (actual, expected) => {
    expect(matchEncodedDeclaration(actual, expected)).toBeUndefined()
  })

  it.each([
    ['animation-duration', '1'],
    ['animation-duration', '1000s'],
    ['animation-iteration-count', '1'],
    ['animation-iteration-count', '1000000001'],
    ['animation-timing-function', '[ease]'],
    ['animation-delay', '10'],
    ['animation-name', 'other'],
  ])('动画 %s 的错误值 %s 不能被 shorthand 吞掉', (property, value) => {
    const actual = animation.map(item => item.property === property ? declaration(property, value) : item)
    expect(matchEncodedDeclaration(actual, animationExpected)).toBeUndefined()
  })

  it.each(animation.map(item => item.property))('动画缺少 %s 时拒绝完整证明', (property) => {
    expect(matchEncodedDeclaration(animation.filter(item => item.property !== property), animationExpected)).toBeUndefined()
  })

  it('明确的 ms 和有限 iteration 预期也须逐值相等', () => {
    const actual = animation.map(item => item.property === 'animation-iteration-count' ? declaration(item.property, '3') : item)
    expect(matchEncodedDeclaration(actual, declaration('animation', 'spin 1000ms linear 3'))).toEqual(actual)
    expect(matchEncodedDeclaration(actual, animationExpected)).toBeUndefined()
  })

  it('value 未声明只证明完整属性结构，不能由部分 flex/span 代替', () => {
    expect(matchEncodedDeclaration(animation, { property: 'animation' })).toEqual(animation)
    expect(matchEncodedDeclaration([declaration('grid-column-span', '2')], { property: 'grid-column' })).toHaveLength(1)
    expect(matchEncodedDeclaration([declaration('grid-column-start', '1')], { property: 'grid-column' })).toBeUndefined()
    expect(matchEncodedDeclaration([declaration('grid-column-span', '0')], { property: 'grid-column' })).toBeUndefined()
    expect(matchEncodedDeclaration([declaration('flex-grow', '1')], { property: 'flex' })).toBeUndefined()
  })

  it('每个展开声明都必须保留 important，且不能读取被后续声明覆盖的旧值', () => {
    const importantPadding = padding.map(item => ({ ...item, important: true }))
    const expected = { ...declaration('padding', '13px'), important: true }
    expect(matchEncodedDeclaration(importantPadding, expected)).toEqual(importantPadding)
    expect(matchEncodedDeclaration(padding, expected)).toBeUndefined()
    expect(matchEncodedDeclaration([...padding, declaration('padding-top', '14px')], declaration('padding', '13px'))).toBeUndefined()
    expect(matchEncodedDeclaration([...importantPadding, declaration('padding-top', '14px')], expected)).toEqual(importantPadding)
    expect(matchEncodedDeclaration([...importantPadding, declaration('padding-top', '14px', true)], expected)).toBeUndefined()
  })

  it('未知 shorthand 和缺失的属性保持失败，不能从 expected 构造 actual', () => {
    expect(matchEncodedDeclaration([], declaration('padding', '13px'))).toBeUndefined()
    expect(matchEncodedDeclaration(padding, declaration('border', '1px solid red'))).toBeUndefined()
    expect(matchEncodedDeclaration([declaration('padding-top', '13px')], declaration('padding', '13px'))).toBeUndefined()
  })
})
