/* eslint-disable no-template-curly-in-string */
import { getCss } from '#test/helpers/getTwCss'

import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { isCI } from 'ci-info'
// import punycode from 'node:punycode'
import { getCompilerContext } from '@/context'
import { getDefaultOptions } from '@/defaults'
import { parseCache } from '@/js/babel'
import { createJsHandler } from '@/js/index'
import { decodeUnicode } from '@/utils/decode'
// swc 在解析中文的时候，会导致 span 增加，从而无法精确定位，不知道是不是bug
import { createGetCase, createPutCase, jsCasePath, tsCasePath } from './util'
// import { parse } from '@/babel'
const getCase = createGetCase(jsCasePath)
const getTsCase = createGetCase(tsCasePath)
const putCase = createPutCase(jsCasePath)

async function getClassCacheSet() {
  const ctx = getCompilerContext()
  return ctx.tailwindRuntime.getClassSet()
}

const testTable = [
  {
    name: 'common',
  },
] as {
  name: string
  strategy?: 'replace'
}[]

describe('jsHandler', () => {
  let h: ReturnType<typeof createJsHandler>
  let dh: ReturnType<typeof createJsHandler>
  let defaultJsHandler: ReturnType<typeof createJsHandler>
  beforeEach(() => {
    parseCache.clear()
    h = createJsHandler({
      escapeMap: MappingChars2String,
    })

    dh = createJsHandler({
      escapeMap: MappingChars2String,
      // minifiedJs: true,
      arbitraryValues: {
        allowDoubleQuotes: true,
      },
    })

    const { jsHandler } = getCompilerContext()
    defaultJsHandler = jsHandler
  })
  it.each(testTable)('$name common case', async () => {
    const set: Set<string> = new Set()
    set.add('text-[12px]')
    set.add('flex')
    set.add('w-2.5')

    const { code } = await h(`const n = 'text-[12px] flex bg-[red] w-2.5'`, set)
    expect(code).toBe('const n = \'text-_b12px_B flex bg-[red] w-2_d5\'')
  })

  it('ignoreCallExpressionIdentifiers common case', async () => {
    const set: Set<string> = new Set()
    set.add('text-[12px]')
    set.add('flex')
    set.add('w-2.5')

    const { code } = await defaultJsHandler(`const n = cn('text-[12px] flex bg-[red] w-2.5')`, set, {
      ignoreCallExpressionIdentifiers: ['cn'],
    })
    expect(code).toBe(`const n = cn('text-[12px] flex bg-[red] w-2.5')`)
  })

  it('ignoreCallExpressionIdentifiers common case 1', async () => {
    const set: Set<string> = new Set()
    set.add('text-[12px]')
    set.add('flex')
    set.add('w-2.5')
    set.add('p-1.5')
    const testCase = `const n = cn('text-[12px] flex bg-[red] w-2.5 ' + cn('p-1.5') )`
    const { code } = await defaultJsHandler(testCase, set, {
      ignoreCallExpressionIdentifiers: ['cn'],
    })
    expect(code).toBe(testCase)
  })

  it('ignoreCallExpressionIdentifiers common case 2', async () => {
    const set: Set<string> = new Set()
    set.add('text-[12px]')
    set.add('flex')
    set.add('w-2.5')
    set.add('p-1.5')
    const testCase = `const n = cn('text-[12px] flex bg-[red] w-2.5 ' + cn('p-1.5') )`
    const { code } = await defaultJsHandler(testCase, set, {
      ignoreCallExpressionIdentifiers: ['cva'],
    })
    expect(code).toBe('const n = cn(\'text-_b12px_B flex bg-[red] w-2_d5 \' + cn(\'p-1_d5\') )')
  })

  it('ignoreCallExpressionIdentifiers common case 3', async () => {
    const set: Set<string> = new Set()
    set.add('text-[12px]')
    set.add('flex')
    set.add('w-2.5')
    set.add('p-1.5')
    const testCase = `const n = cn('text-[12px] flex bg-[red] w-2.5 ' + cn('p-1.5') )`
    const { code } = await defaultJsHandler(testCase, set, {
      ignoreCallExpressionIdentifiers: ['cxn'],
    })
    expect(code).toBe('const n = cn(\'text-_b12px_B flex bg-[red] w-2_d5 \' + cn(\'p-1_d5\') )')
  })

  // 默认情况
  it('ignoreCallExpressionIdentifiers common case 4', async () => {
    const set: Set<string> = new Set()
    set.add('text-[12px]')
    set.add('flex')
    set.add('w-2.5')
    set.add('p-1.5')
    const testCase = `const n = cn('text-[12px] flex bg-[red] w-2.5 ' + cn('p-1.5') )`
    const { code } = await defaultJsHandler(testCase, set, {
      ignoreCallExpressionIdentifiers: ['cn'],
    })
    expect(code).toBe(`const n = cn('text-[12px] flex bg-[red] w-2.5 ' + cn('p-1.5') )`)
  })

  it.each(testTable)('$name common case with ignore comment', async () => {
    const set: Set<string> = new Set()
    set.add('text-[12px]')
    set.add('flex')
    set.add('w-2.5')

    const { code } = await h(`const n = /*weapp-tw ignore*/ 'text-[12px] flex bg-[red] w-2.5'`, set)
    expect(code).toBe('const n = /*weapp-tw ignore*/ \'text-[12px] flex bg-[red] w-2.5\'')
  })

  it.each(testTable)('$name preserve space', async () => {
    const set: Set<string> = new Set()
    set.add('text-[12px]')
    set.add('flex')
    set.add('w-2.5')
    const xxx = h

    const { code } = await xxx('const n = \'text-[12px] flex \\n bg-[red] w-2.5\'', set)
    expect(code).toBe('const n = \'text-_b12px_B flex \\n bg-[red] w-2_d5\'')
  })

  it.each(testTable)('$name preserve space case2', async () => {
    const set: Set<string> = new Set()
    set.add('text-[12px]')
    set.add('flex')

    const { code } = await h('const n = `text-[12px] \\n\\n  flex  \\n\\n  bg-[red]`', set)
    expect(code).toBe('const n = `text-_b12px_B \\n\\n  flex  \\n\\n  bg-[red]`')
  })

  it.each(testTable)('$name babel TemplateElement case', async () => {
    const set: Set<string> = new Set()
    set.add('text-[12px]')
    set.add('flex')
    set.add('bg-[red]')

    const { code } = await h('const p = \'text-[12px]\';const n = `${p} \\n\\n  flex  \\n\\n  bg-[red] \'`', set)
    expect(code).toBe('const p = \'text-_b12px_B\';const n = `${p} \\n\\n  flex  \\n\\n  bg-_bred_B \'`')
  })

  it.each(testTable)("'$name' TemplateElement case 0", async () => {
    const set: Set<string> = new Set()
    set.add('text-[12px]')
    set.add('text-[199px]')
    set.add('flex')
    set.add('bg-[url(\'天气好\')]')
    set.add('bg-[red]')

    const { code } = await h('const p = \'text-[12px]\';const n = `bg-[url(\'天气好\')]${p}text-[199px] \\n\\n  flex  \\n\\n  bg-[red] \'`', set)
    expect(code).toMatchSnapshot()
  })

  it.each(testTable)("'$name' mpx jit classNames", async () => {
    const testCase = `data: {
      classNames: "text-[#123456] text-[50px] bg-[#fff]"
    }`

    const set: Set<string> = new Set()
    set.add('text-[#123456]')
    set.add('bg-[#fff]')
    set.add('text-[50px]')

    const { code } = await h(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('does not transform unrelated template fragments when runtime set is limited', async () => {
    const runtimeSet = new Set([
      'active:bg-emerald-50',
      'active:bg-emerald-600',
      'aspect-(--my-aspect-ratio)',
      'aspect-[calc(4*3+1)/3]',
      'bg-[#0000ff]',
      'divide-[#41eb04]',
      'divide-[#d80c0c]',
      'text-[#00f285]',
      'text-[#929292]',
      'text-[45rpx]',
      'text-[88rpx]',
      'text/event-stream',
    ])

    const source = `const world = {
  Accept: weappTwIgnore\`text/event-stream\`,
  CCC: \`text\` + \`/evexstream\`,
}`

    const { code } = await defaultJsHandler(source, runtimeSet)
    expect(code).toBe(source)
  })

  it('keeps plain slash literals unchanged even when runtime set contains the same value', async () => {
    const runtimeSet = new Set(['text/event-stream'])
    const source = `const header = weappTwIgnore\`text/event-stream\`
const duplicated = 'text/event-stream'`

    const { code } = await defaultJsHandler(source, runtimeSet)
    expect(code).toBe(source)
  })

  it.each(testTable)("'$name' img url case", async () => {
    const testCase = `data: {
      classNames: "bg-[url('https://ylnav.com/assets/images/vu/divider-gray.webp')]"
    }`

    const set: Set<string> = new Set()
    set.add('bg-[url(\'https://ylnav.com/assets/images/vu/divider-gray.webp\')]')

    const { code } = await h(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it.skipIf(isCI)('"after:content-["对酒当歌，人生几何"]"', async () => {
    const testCase = 'const a = \'after:content-["对酒当歌，人生几何"]\''
    await getCss(testCase)
    const set = await getClassCacheSet()
    const { code } = await dh(testCase, set)
    expect(code).toMatchSnapshot()
  }, 120_000)

  it.skipIf(isCI).each(testTable)('$name "after:content-[\'对酒当歌，人生几何\']"', async () => {
    const testCase = 'const a = "after:content-[\'对酒当歌，人生几何\']"'
    await getCss(testCase)
    const set = await getClassCacheSet()

    const { code } = await h(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('jsPreserveClass \'*\' keyword', async () => {
    const set: Set<string> = new Set()
    set.add('*')

    const { code } = await defaultJsHandler('const n = \'* 1 * 2\'', set)

    expect(code).toMatchSnapshot()
  })

  it('jsPreserveClass \'*\' and \'w-[100px]\' keyword', async () => {
    const set: Set<string> = new Set()
    set.add('*')
    set.add('w-[100px]')
    const myCustomJsHandler = createJsHandler({
      escapeMap: MappingChars2String,
      jsPreserveClass(keyword) {
        if (getDefaultOptions().jsPreserveClass?.(keyword)) {
          return true
        }
        if (keyword === 'w-[100px]') {
          return true
        }
      },
    })
    const { code } = await myCustomJsHandler('const n = \'* 1 * 2 w-[100px]\'', set)

    expect(code).toMatchSnapshot()
  })

  it('jsPreserveClass \'*\' and but not \'w-[100px]\' keyword', async () => {
    const set: Set<string> = new Set()
    set.add('*')
    set.add('w-[100px]')
    const myCustomJsHandler = createJsHandler({
      escapeMap: MappingChars2String,
      jsPreserveClass(keyword) {
        if (getDefaultOptions().jsPreserveClass?.(keyword)) {
          return true
        }
        // if (keyword === 'w-[100px]') {
        //   return true
        // }
      },
    })
    const { code } = await myCustomJsHandler('const n = \'* 1 * 2 w-[100px]\'', set)
    expect(code).toBe('const n = \'* 1 * 2 w-_b100px_B\'')
  })

  it('[replace] jsPreserveClass \'*\' and but not \'w-[100px]\' keyword', async () => {
    const set: Set<string> = new Set()
    set.add('*')
    set.add('w-[100px]')
    const myCustomJsHandler = createJsHandler({
      escapeMap: MappingChars2String,
      jsPreserveClass(keyword) {
        if (getDefaultOptions().jsPreserveClass?.(keyword)) {
          return true
        }
        // if (keyword === 'w-[100px]') {
        //   return true
        // }
      },
    })
    const { code } = await myCustomJsHandler('const n = \'* 1 * 2 w-[100px]\'', set)
    expect(code).toBe('const n = \'* 1 * 2 w-_b100px_B\'')
  })

  it('lINEFEED case', async () => {
    const testCase = 'const LINEFEED = "\\n";'
    const set = new Set<string>()
    const { code } = await h(testCase, set)
    // 'const LINEFEED = "\n";'
    // 'const LINEFEED = "\\n";'
    expect(code).toBe(testCase)

    // \n 被展开导致的错误
    //     const LINEFEED = "
    // ";
  })

  // it('source map case 0', () => {
  //   const set: Set<string> = new Set()
  //   set.add('w-[100px]')
  //   const { code, map } = jsHandler("const n = '* 1 * 2 w-[100px]'", set)
  //   expect(code).toBe("const n = '* 1 * 2 w-_b100px_B'")
  //   expect(map).toBeTruthy()
  //   expect(map?.toString()).toBe('{"version":3,"sources":[""],"names":[],"mappings":"AAAA,WAAW,iBAAiB"}')
  // })

  it('eval StringLiteral case 0', async () => {
    const set: Set<string> = new Set()
    set.add('w-[100px]')
    const { code } = await h(`eval("const cls = 'w-[100px]';console.log(cls)")`, set)
    expect(code).toBe('eval("const cls = \\\'w-_b100px_B\\\';console.log(cls)")')
  })

  it('eval TemplateElement case 0', async () => {
    const set: Set<string> = new Set()
    set.add('w-[100px]')
    const { code } = await h('eval(`const cls = \'w-[100px]\';console.log(cls)`)', set)
    expect(code).toBe('eval(`const cls = \'w-_b100px_B\';console.log(cls)`)')
  })

  it('eval StringLiteral case regen 0', async () => {
    const set: Set<string> = new Set()
    set.add('w-[100px]')
    const { code } = await h(`eval("const cls = 'w-[100px]';console.log(cls)")`, set)
    expect(code).toBe('eval("const cls = \\\'w-_b100px_B\\\';console.log(cls)")')
  })

  it('eval TemplateElement case regen 0', async () => {
    const set: Set<string> = new Set()
    set.add('w-[100px]')
    const { code } = await h('eval(`const cls = \'w-[100px]\';console.log(cls)`)', set)
    expect(code).toBe('eval(`const cls = \'w-_b100px_B\';console.log(cls)`)')
  })

  it('jsStringEscape getCase 0', async () => {
    const aarun = await getCase('jsStringEscape.js')
    const set: Set<string> = new Set()
    set.add('w-[100px]')
    set.add('w-[99px]')
    const { code } = await h(aarun, set)
    await putCase('jsStringEscape.res.js', code)
    expect(code).toMatchSnapshot()
  })
  // it('eval StringLiteral case 1', () => {
  //   const set: Set<string> = new Set()
  //   set.add('w-[100px]')
  //   const code = h(`eval("const cls = 'w-[100px]'\\\n;console.log(cls)")`, set).code
  //   expect(code).toBe('eval("const cls = \\\'w-_b100px_B\\\';console.log(cls)")')
  // })

  it('taro-url-before case', async () => {
    const aarun = await getCase('taro-url-before.js')
    const set: Set<string> = new Set()
    const { code } = await h(aarun, set)
    expect(code).toMatchSnapshot()
  })

  it('unicode case 0', async () => {
    const unicodeCase = await getCase('taro-url-unicode.js')
    const set: Set<string> = new Set()
    const { code } = await h(unicodeCase, set)
    expect(code).toMatchSnapshot()
  })

  it('taro-lottie-miniprogram-dev', async () => {
    const testCase = await getCase('taro-lottie-miniprogram-dev.js')
    const set: Set<string> = new Set()
    const { jsHandler } = getCompilerContext()
    expect(jsHandler(testCase, set)).toMatchObject({
      code: expect.any(String),
    })
  })

  it('taro-lottie-miniprogram-build-no-compress', async () => {
    const testCase = await getCase('taro-lottie-miniprogram-build-no-compress.js')
    const set: Set<string> = new Set()
    const { jsHandler } = getCompilerContext()
    expect(jsHandler(testCase, set)).toMatchObject({
      code: expect.any(String),
    })
  })

  it('taro-lottie-miniprogram-build', async () => {
    const testCase = await getCase('taro-lottie-miniprogram-build.js')
    const set: Set<string> = new Set()
    const { jsHandler } = getCompilerContext()
    expect(jsHandler(testCase, set)).toMatchObject({
      code: expect.any(String),
    })
  })

  it('issues/276 case 0', async () => {
    const testCase = `const x = "rounded-[20rpx] before:rounded-[20rpx]"`
    const set: Set<string> = new Set()
    set.add('rounded-[20rpx]')
    set.add('before:rounded-[20rpx]')
    const { jsHandler } = getCompilerContext()
    const { code } = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('issues/276 case 1', async () => {
    const testCase = `const x = "rounded-[20rpx] before:rounded-[20rpx]"`
    const set: Set<string> = new Set()
    set.add('before:rounded-[20rpx]')
    set.add('rounded-[20rpx]')

    const { jsHandler } = getCompilerContext()
    const { code } = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('issues/276 case 2', async () => {
    const testCase = `const x = "before:rounded-[20rpx] rounded-[20rpx]"`
    const set: Set<string> = new Set()
    set.add('rounded-[20rpx]')
    set.add('before:rounded-[20rpx]')
    const { jsHandler } = getCompilerContext()
    const { code } = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('issues/276 case 3', async () => {
    const testCase = `const x = "before:rounded-[20rpx] rounded-[20rpx]"`
    const set: Set<string> = new Set()
    set.add('before:rounded-[20rpx]')
    set.add('rounded-[20rpx]')

    const { jsHandler } = getCompilerContext()
    const { code } = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('中文字符 case 0', async () => {
    const testCase = `const a ={ className: "after:content-['\u7684\u6492\u7684\u6492']", children: "\u4E8B\u5B9E\u4E0A" }`
    const set: Set<string> = new Set()
    set.add('after:content-[\'的撒的撒\']')

    const { jsHandler } = getCompilerContext()
    const { code } = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('中文字符 case 2', async () => {
    const testCase = `"use strict";(wx["webpackJsonp"]=wx["webpackJsonp"]||[]).push([[280],{3747:function(n,e,o){var t=o(6073),c=o(118),r=o(5349),u=function(){return(0,r.jsx)(c.Ss,{className:"before:content-['moduleA_\u666E\u901A\u5206\u5305']",children:"moduleA \u666E\u901A\u5206\u5305"})},s={};Page((0,t.createPageConfig)(u,"moduleA/pages/index",{root:{cn:[]}},s||{}))}},function(n){var e=function(e){return n(n.s=e)};n.O(0,[907,96],(function(){return e(3747)}));n.O()}]);`
    const set: Set<string> = new Set()
    set.add('before:content-[\'moduleA_普通分包\']')

    const { jsHandler } = getCompilerContext()
    const { code } = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('中文字符产物 case 0', async () => {
    const testCase = await getCase('taro-vue-rust-zh.js')
    const set: Set<string> = new Set()
    set.add('after:content-[\'我知道我心,永恒12we_ds\']')

    const { jsHandler } = getCompilerContext()
    const { code } = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('中文字符产物 case 2', async () => {
    const testCase = await getCase('taro-vue3-test-dist.js')
    const set: Set<string> = new Set()
    set.add('after:content-[\'我知道我心,永恒12we_ds\']')

    const { jsHandler } = getCompilerContext()
    const code = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('中文字符产物 case 3', async () => {
    const testCase = await getCase('taro-vue3-test-build-dist.js')
    const set: Set<string> = new Set()
    set.add('after:content-[\'我知道我心,永恒12we_ds\']')

    const { jsHandler } = getCompilerContext()
    const code = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('中文字符产物 case 4', async () => {
    const testCase = await getCase('taro-vue3-test-build-dist-short.js')
    const set: Set<string> = new Set()
    set.add('after:content-[\'我知道我心,永恒12we_ds\']')

    const { jsHandler } = getCompilerContext()
    const code = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('中文字符转义 case 0', () => {
    const a1: string = 'after:content-[\'\\u6211\\u77e5\\u9053\\u6211\\u5fc3,\\u6c38\\u605212we_ds\']'
    const a2: string = 'after:content-[\'我知道我心,永恒12we_ds\']'
    expect(a1 === a2).toBe(false)
  })

  it('中文字符转义 case 1', () => {
    const a1: string = 'after:content-[\'\u6211\u77E5\u9053\u6211\u5FC3,\u6C38\u605212we_ds\']'
    const a2: string = 'after:content-[\'我知道我心,永恒12we_ds\']'
    expect(a1 === a2).toBe(true)
  })

  it('中文字符转义 case 2', () => {
    const str: string = decodeUnicode('after:content-[\'\\u6211\\u77e5\\u9053\\u6211\\u5fc3,\\u6c38\\u605212we_ds\']')
    // 匹配Unicode编码的正则表达式
    // const unicodeRegex = /\\\\?\\/g

    // // 替换Unicode编码为对应字符
    // str = str.replaceAll(unicodeRegex, function (match) {
    //   return match === '\\' ? '' : String.fromCodePoint(Number.parseInt('0x' + match.slice(2), 16))
    // })
    const a2: string = 'after:content-[\'我知道我心,永恒12we_ds\']'
    expect(str === a2).toBe(true)
  })

  it('empty case 0', async () => {
    const testCase = `const a = ''`
    const set: Set<string> = new Set()

    const { jsHandler } = getCompilerContext()
    const code = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('short case 0', async () => {
    const testCase = `const a = '1'`
    const set: Set<string> = new Set()

    const { jsHandler } = getCompilerContext()
    const code = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })
  // it('中文字符产物 after build case 0', () => {
  //   const a = "w-1.5 h-[calc(100vh-100px)] bg-[#fafafa] after:content-['\u6211\u77E5\u9053\u6211\u5FC3,\u6C38\u605212we_ds']"
  // })

  // const b = "after:content-['\\u6211\\u77e5\\u9053\\u6211\\u5fc3,\\u6c38\\u605212we_ds']"

  // "after:content-['我知道我心,永恒12we_ds']"

  it('ts file parser 0', async () => {
    const testCase = await getTsCase('native-ts-0.ts')
    const set: Set<string> = new Set()
    set.add('text-[100px]')
    set.add('bg-[#123456]')
    const { jsHandler } = getCompilerContext()
    expect(async () => {
      const { code, error } = await jsHandler(testCase, set)
      expect(code).toMatchSnapshot()
      expect(error).toBeFalsy()
    }).not.toThrow()
  })

  it('ts file parser noting', async () => {
    const testCase = await getTsCase('native-ts-noting.ts')
    const set: Set<string> = new Set()

    const { jsHandler } = getCompilerContext()
    expect(async () => {
      const { code, error } = await jsHandler(testCase, set)
      expect(code).toBe(testCase)
      expect(error).toBeFalsy()
    }).not.toThrow()
  })

  it('ts file parser throw error', async () => {
    const testCase = await getTsCase('native-ts-throw.ts')
    const set: Set<string> = new Set()

    const { jsHandler } = getCompilerContext()
    const { error } = await jsHandler(testCase, set)
    expect(error).toBeTruthy()
  })

  it('ts file parser not throw error 0', async () => {
    const testCase = await getTsCase('native-ts-throw.ts')
    const set: Set<string> = new Set()

    const { jsHandler } = getCompilerContext({
      babelParserOptions: {
        plugins: ['typescript'],
      },
    })
    const { error } = await jsHandler(testCase, set)
    expect(error).toBeFalsy()
  })

  it('ts file parser not throw error 1', async () => {
    const testCase = await getTsCase('native-ts-throw.ts')
    const set: Set<string> = new Set()

    const { jsHandler } = getCompilerContext({
      babelParserOptions: {
        // @ts-ignore
        plugins: ['@babel/plugin-syntax-typescript'],
      },
    })
    const { error } = await jsHandler(testCase, set)
    expect(error).toBeTruthy()
  })

  it('注释忽略 case 1', async () => {
    const testCase = `const a = '!hidden'`
    const set: Set<string> = new Set()
    set.add('!hidden')

    const { jsHandler } = getCompilerContext({})
    const { code } = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('注释忽略 case 3', async () => {
    const testCase = `const a = /*@weapp-tw ignore*/ '!hidden'`
    const set: Set<string> = new Set()
    set.add('!hidden')

    const { jsHandler } = getCompilerContext({})
    const { code } = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('标识符忽略 case 4', async () => {
    const testCase = `const a = weappTwIgnore\`!hidden\``
    const set: Set<string> = new Set()
    set.add('!hidden')

    const { jsHandler } = getCompilerContext({})
    const { code } = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('标识符忽略 case 5', async () => {
    const testCase = `    console.log("!hidden");
    console.log(
      /*@weapp-tw ignore*/
      "!hidden"
    );
    console.log(weappTwIgnore\`!hidden\`)`
    const set: Set<string> = new Set()
    set.add('!hidden')

    const { jsHandler } = getCompilerContext({})
    const { code } = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('标识符忽略 case 6', async () => {
    const testCase = `console.log(weappTwIgnore\`!hidden\`);`
    const set: Set<string> = new Set()
    set.add('!hidden')

    const { jsHandler } = getCompilerContext({})
    const { code } = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('ignoreTaggedTemplateIdentifiers transforms String.raw alias by default', async () => {
    const testCase = `const a = String.raw;console.log(a\`!hidden\`);`
    const set: Set<string> = new Set()
    set.add('!hidden')

    const { jsHandler } = getCompilerContext()
    const { code } = await jsHandler(testCase, set)
    expect(code).not.toBe(testCase)
    expect(code).not.toContain('!hidden')
  })

  it('ignoreTaggedTemplateIdentifiers transforms chained aliases to String.raw', async () => {
    const testCase = `const rawAlias = String.raw;const anotherAlias = rawAlias;anotherAlias\`!hidden\`;`
    const set: Set<string> = new Set()
    set.add('!hidden')

    const { jsHandler } = getCompilerContext()
    const { code } = await jsHandler(testCase, set)
    expect(code).not.toBe(testCase)
    expect(code).not.toContain('!hidden')
  })

  it('ignoreTaggedTemplateIdentifiers ignores explicit alias markers on plain String.raw', async () => {
    const testCase = `const alias = String.raw;alias.__weapp_tw_ignore__ = true;alias\`!hidden\`;`
    const set: Set<string> = new Set()
    set.add('!hidden')

    const { jsHandler } = getCompilerContext()
    const { code } = await jsHandler(testCase, set)
    expect(code).not.toBe(testCase)
    expect(code).not.toContain('!hidden')
  })

  it('twMerge case 0', async () => {
    const testCase = `twMerge('bg-[#434332] px-[32px]', 'bg-[#123324] px-[35px]')`
    const set: Set<string> = new Set()
    set.add('bg-[#434332]')
    set.add('px-[32px]')
    set.add('bg-[#123324]')
    set.add('px-[35px]')
    const { jsHandler } = getCompilerContext(
      {
        ignoreCallExpressionIdentifiers: ['twMerge'],
      },
    )
    const { code } = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it('twMerge case 1', async () => {
    const testCase = `twMerge('bg-[#434332] px-[32px]', 'bg-[#123324] px-[35px]')`
    const set: Set<string> = new Set()
    set.add('bg-[#434332]')
    set.add('px-[32px]')
    set.add('bg-[#123324]')
    set.add('px-[35px]')
    const { jsHandler } = getCompilerContext(
      {
        ignoreCallExpressionIdentifiers: [],
      },
    )
    const { code } = await jsHandler(testCase, set)
    expect(code).toMatchSnapshot()
  })
})
