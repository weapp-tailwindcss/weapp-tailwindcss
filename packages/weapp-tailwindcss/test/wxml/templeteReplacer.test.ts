import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { templateReplacer } from '@/wxml/utils'

const testTable = [[{}]]

function simpleReplacer(str: string) {
  return templateReplacer(str, {
    escapeMap: MappingChars2String,
  })
}

describe('templateReplacer', () => {
  it.each(testTable)('$label isStringLiteral', () => {
    const testCase = '{{[\'som-node__label\',\'data-v-59229c4a\',\'som-org__text-\'+(node.align||\'\'),node.active||collapsed?\'som-node__label-active\':\'\',d]}}'

    const result = simpleReplacer(testCase)

    expect(result).toMatchSnapshot()
  })

  it('isConditionalExpression', () => {
    const testCase = '{{[\'flex\',\'flex-col\',\'items-center\',flag===1?\'bg-red-900\':\'bg-[#fafa00]\']}}'
    const result = simpleReplacer(testCase)

    expect(result).toMatchSnapshot()
  })

  it('nest ', () => {
    const testCase
      = '{{[flag?\'bg-red-900\':\'bg-[#fafa00]\',classObject,[(flag===true)?\'bg-[#fafa00]\':\'\',(true)?\'text-sm\':\'\'],flag?flag===false?\'bg-red-900\':\'bg-[#000]\':\'bg-[#fafa00]\']}}'

    const result = simpleReplacer(testCase)

    expect(result).toMatchSnapshot()
  })

  it('sm:text-3xl dark:text-sky-400', () => {
    const testCase = 'sm:text-3xl dark:text-slate-200 bg-[#ffffaa]'
    const result = simpleReplacer(testCase)

    expect(result).toMatchSnapshot()
  })

  it('\\r\\n replace test', () => {
    const testCase = `
    bg-white
    rounded-full
    w-10
    h-10
    flex
    justify-center
    items-center
    pointer-events-auto
  `
    const result = simpleReplacer(testCase)
    expect(result).toBe('    bg-white    rounded-full    w-10    h-10    flex    justify-center    items-center    pointer-events-auto  ')
  })

  it('\\r\\n replace test with var', () => {
    const testCase = `{{[
      'flex',
      'items-center',
      'justify-center',
      'h-[100px]',
      'w-[100px]',
      'rounded-[40px]',
      'bg-[#123456]',
      'bg-opacity-[0.54]',
      'text-[#ffffff]',
      'data-v-1badc801',
      'text-[#123456]',
      b]}}`
    const result = simpleReplacer(testCase)
    expect(result).toBe(
      `{{[
      'flex',
      'items-center',
      'justify-center',
      'h-_b100px_B',
      'w-_b100px_B',
      'rounded-_b40px_B',
      'bg-_b_h123456_B',
      'bg-opacity-_b0_d54_B',
      'text-_b_hffffff_B',
      'data-v-1badc801',
      'text-_b_h123456_B',
      b]}}`,
    )
  })

  it('variables with multiple literal', () => {
    const testCase = `border-0 icon h-10 w-10 mx-auto {{active=='home'? 'icon-home-selected' : 'icon-home'}} {{}} {{ }} w-[20px] {{flag=='p-[20px]'? 'p-[20px]' : 'm-[20px]'}} h-[20px]`
    const result = simpleReplacer(testCase)
    expect(result).toMatchSnapshot()
  })

  it.each(testTable)('variables with multiple literal(2)', () => {
    const testCase = `border-0 icon h-10 w-10 mx-auto {{active=='home'? 'icon-home-selected' : 'icon-home'}} {{b}} {{ a==='cc' }} w-[20px] {{flag=='p-[20px]'? 'p-[20px]' : 'm-[20px]'}}`
    const result = simpleReplacer(testCase)
    expect(result).toMatchSnapshot()
  })

  it.each(testTable)('%label for toutiao str add not array', () => {
    const testCase = '{{(\'!font-bold\') + \' \' + \'!text-[#990000]\' + \' \' + \'data-v-1badc801\' + \' \' + \'text-2xl\' + \' \' + b}}' // '{{\'font-bold\'+\'\'+\'text-blue-500\'+\'\'+\'data-v-1badc801\'+\'\'+\'text-2xl\'+\'\'+b}}'

    const result = simpleReplacer(testCase)
    expect(result).toMatchSnapshot()
  })

  it.each(testTable)('%label utils.bem()', () => {
    const testCase
      = 'custom-class {{ utils.bem(\'button\', [type, size, { block, round, plain, square, loading, disabled, hairline, unclickable: disabled || loading }]) }} {{ hairline ? \'van-hairline--surround\' : \'\' }}'

    const result = simpleReplacer(testCase)
    expect(result).toMatchSnapshot()
  })

  it('classGenerator class with string var', () => {
    const testCase = 'btn-%1 a[p-1]{{num}}'
    // classGenerator
    const str = simpleReplacer(testCase)
    expect(str).toMatchSnapshot()
  })

  it('classGenerator class with string var case 0', () => {
    const testCase = 'btn-%1 a[p-1]{{num}}'
    // classGenerator
    const str = simpleReplacer(testCase)
    expect(str).toBe('btn-_v1 a_bp-1_B{{num}}')
  })

  it('classGenerator class with string var case 1', () => {
    const testCase = 'btn-%1 a[p-1]{{num}}b[b-2]'
    // classGenerator
    const str = simpleReplacer(testCase)
    expect(str).toBe('btn-_v1 a_bp-1_B{{num}}b_bb-2_B')
  })

  it('classGenerator class with string var case 2', () => {
    const testCase = 'a[p-1]{{num}}b[b-2]{{p}}'
    // classGenerator
    const str = simpleReplacer(testCase)
    expect(str).toBe('a_bp-1_B{{num}}b_bb-2_B{{p}}')
  })

  // .shadow-\[0px_2px_11px_0px_rgba\(0\2c 0\2c 0\2c 0\.4\)\]
  it('arbitrary shadow values 0', () => {
    // 逗号 comma 的原因
    const testCase = 'shadow-[0px_2px_11px_0px_rgba(0,0,0,0.4)]'

    const result = simpleReplacer(testCase)
    expect(result).toMatchSnapshot()
  })

  // .shadow-\[0px_2px_11px_0px_\#0000000a\]
  it('arbitrary shadow values 1', () => {
    const testCase = 'shadow-[0px_2px_11px_0px_#00000a]'
    const result = simpleReplacer(testCase)
    expect(result).toMatchSnapshot()
  })

  it('arbitrary before:content-[\'hello\']', () => {
    const testCase = 'before:content-[\'hello\']'
    const result = simpleReplacer(testCase)
    expect(result).toMatchSnapshot()
  })

  it('two ConditionalExpression', () => {
    const testCase = 'btn a{{num >=\'p-[1]\'?num===\'q-[2]\'?\'x-[0]\':\'y-[1]\':\'z-[2]\'}}'
    const result = simpleReplacer(testCase)
    expect(result).toMatchSnapshot()
  })

  it.skip('start up with num case', () => {
    const nums = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

    for (const num of nums) {
      const testCase = `${num}xl:text-base`
      const result = templateReplacer(testCase)
      expect(result).toBe(`_${num}xlctext-base`)

      const netestCase = `-${num}xl:text-base`
      const neresult = templateReplacer(netestCase)
      expect(neresult).toBe(`_-${num}xlctext-base`)
    }
  })
  // https://www.w3.org/TR/css-syntax-3/#ident-token-diagram
  it.skip('only - escape', () => {
    let result = templateReplacer('-')
    expect(result).toBe(`_-`)
    result = templateReplacer('--')
    expect(result).toBe(`--`)
  })

  it('font-size#setting-the-line-height', () => {
    let testCase = 'text-sm/[17px]'

    expect(simpleReplacer(testCase)).toBe('text-sm_f_b17px_B')
    testCase = 'text-base/loose'
    expect(simpleReplacer(testCase)).toBe('text-base_floose')
    testCase = 'text-[64rpx]/[72rpx]'
    expect(simpleReplacer(testCase)).toBe('text-_b64rpx_B_f_b72rpx_B')
  })

  it('issues/274 {{class}}', () => {
    expect(simpleReplacer(`{{class}}`)).toBe('{{class}}')
  })

  it('issues/276 case 0', () => {
    expect(simpleReplacer(`relative h-12 w-12 before:absolute before:inset-0 before:border-2 before:border-red-500 rounded-[20rpx] before:rounded-[20rpx]`)).toBe(
      'relative h-12 w-12 before_cabsolute before_cinset-0 before_cborder-2 before_cborder-red-500 rounded-_b20rpx_B before_crounded-_b20rpx_B',
    )
  })

  it('issues/276 case 1', () => {
    expect(simpleReplacer(`relative h-12 w-12 before:absolute before:inset-0 before:border-2 before:border-red-500 before:rounded-[20rpx] rounded-[20rpx]`)).toBe(
      'relative h-12 w-12 before_cabsolute before_cinset-0 before_cborder-2 before_cborder-red-500 before_crounded-_b20rpx_B rounded-_b20rpx_B',
    )
  })
  // https://github.com/sonofmagic/weapp-tailwindcss/issues/316
  it('issues/316 case 0', () => {
    expect(simpleReplacer(`{{tabActive === '1' && 'book-txt__active'}}`)).toBe(
      `{{tabActive === '1' && 'book-txt__active'}}`,
    )
  })

  it('rd-tag case 0', () => {
    expect(simpleReplacer(`rd-tag-{{type}}-{{theme}}`)).toBe(
      `rd-tag-{{type}}-{{theme}}`,
    )
  })

  it('isConditionalExpression case 0', () => {
    const testCase = '{{[\'flex\',\'flex-col\',\'items-center\',flag===1?\'bg-red-900\':\'bg-[#fafa00]\']}}'
    const result = templateReplacer(testCase)
    expect(result).toBe('{{[\'flex\',\'flex-col\',\'items-center\',flag===1?\'bg-red-900\':\'bg-_b_hfafa00_B\']}}')
  })

  it('变量连起来 case 0', () => {
    const testCase = '{{n.attrs.href?\'_a \':\'\'}}{{n.attrs.class}}'
    const result = templateReplacer(testCase)
    expect(result).toBe('{{n.attrs.href?\'_a \':\'\'}}{{n.attrs.class}}')
  })

  it('normalizes whitespace-only fragments between tokens', () => {
    const input = '{{foo}}\n  {{bar}}'
    const result = simpleReplacer(input)
    expect(result).toBe('{{foo}}  {{bar}}')
  })

  it('strips trailing newlines in whitespace fragments', () => {
    const input = '{{foo}}  \n'
    const result = simpleReplacer(input)
    expect(result).toBe('{{foo}}  ')
  })

  // it('handleEachClassFragment case 0', () => {
  //   expect(handleEachClassFragment(`rd-tag-{{type}}-{{theme}}`)).toBe(
  //     `rd-tag-{{type}}-{{theme}}`,
  //   )
  // })

  // it('handleEachClassFragment case 1', () => {
  //   expect(handleEachClassFragment(`{{type}}-{{theme}}`)).toBe(
  //     `{{type}}-{{theme}}`,
  //   )
  // })
})
