import {
  collectCssApplyUtilities,
  cssToClassStyleValue,
  expandCssApplySourcesToStyleValue,
  normalizeUniAppXStyleProperty,
  normalizeUniAppXStyleValue,
} from '@/index'

describe('uni-app x css class style value', () => {
  it.each([
    ['font-size', 'fontSize'],
    ['line-height', 'lineHeight'],
    ['lineHeight', 'lineHeight'],
    ['border-top-left-radius', 'borderTopLeftRadius'],
    ['--tw-leading', '-TwLeading'],
  ])('normalizes the native property %s', (property, expected) => {
    expect(normalizeUniAppXStyleProperty(property)).toBe(expected)
  })

  it.each([
    ['width', ' 12px ', 12],
    ['margin-left', '-1.5px', -1.5],
    ['width', '.5px', '.5px'],
    ['width', '12rpx', '12rpx'],
    ['width', 26, 26],
    ['line-height', ' 26px ', '26px'],
    ['lineHeight', '26px', '26px'],
    ['line-height', 1.5, '1.5'],
    ['lineHeight', 0, '0'],
    ['line-height', '52rpx', '52rpx'],
    ['line-height', '1.625', '1.625'],
    ['color', ' rgb(1, 2, 3) ', 'rgb(1,2,3)'],
    ['transform', 'translate(1px, 2px)', 'translate(1px,2px)'],
    ['width', 'calc(100% - 2px)', 'calc(100% - 2px)'],
    ['--tw-leading', '26px', 26],
  ] as const)('normalizes native %s value %s without changing its compatibility type', (property, value, expected) => {
    expect(normalizeUniAppXStyleValue(property, value)).toBe(expected)
  })

  it('compiles class rules into camelCase declarations with escaped aliases', () => {
    const utilityStyles = cssToClassStyleValue([
      '.flex{display:flex}',
      '.w-\\[12px\\]{width:12px}',
      '.leading-_b26px_B{--tw-leading:26px;line-height:26px}',
    ].join(''))!
    expect(cssToClassStyleValue('.broken{')).toBeUndefined()
    expect(utilityStyles.flex['']).toMatchObject({ display: 'flex' })
    expect(utilityStyles['w-[12px]']['']).toMatchObject({ width: 12 })
    expect(utilityStyles['leading-_b26px_B']['']).toMatchObject({
      '-TwLeading': 26,
      'lineHeight': '26px',
    })
  })

  it('expands apply sources and collects utilities from scss', () => {
    const utilityStyles = cssToClassStyleValue('.flex{display:flex}.w-\\[12px\\]{width:12px}')!
    const applied = expandCssApplySourcesToStyleValue('.card{@apply flex w-[12px]}', utilityStyles)
    expect(applied?.card['']).toMatchObject({ display: 'flex', width: 12 })
    expect(expandCssApplySourcesToStyleValue('.broken{', utilityStyles)).toBeUndefined()
    expect([...collectCssApplyUtilities('.a{@apply flex block}')]).toEqual(['flex', 'block'])
    expect(collectCssApplyUtilities('.broken{').size).toBe(0)
  })
})
