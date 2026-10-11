import path from 'node:path'
import process from 'node:process'
import { getCss } from '#test/helpers/getTwCss'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { createJsHandler } from '@/js/index'
import { createGetCase, jsCasePath } from './util'

const getCase = createGetCase(jsCasePath)

const testTable = [
  {
    name: '[replace strategy]',
    strategy: 'replace',
  },
] as {
  name: string
  strategy?: 'replace'
}[]

describe('taro app', () => {
  let h: ReturnType<typeof createJsHandler>
  let rh: ReturnType<typeof createJsHandler>
  let mh: ReturnType<typeof createJsHandler>
  const originalBase = process.env.WEAPP_TAILWINDCSS_BASEDIR
  // let dh: ReturnType<typeof createJsHandler>
  // let defaultJsHandler: ReturnType<typeof createJsHandler>
  beforeEach(() => {
    process.env.WEAPP_TAILWINDCSS_BASEDIR = path.resolve(__dirname, 'config')
    h = createJsHandler({
      escapeMap: MappingChars2String,
      alwaysEscape: true,
    })
    rh = createJsHandler({
      escapeMap: MappingChars2String,
      alwaysEscape: true,
    })
    mh = createJsHandler({
      escapeMap: MappingChars2String,
      alwaysEscape: true,
    })

    // dh = createJsHandler({
    //   escapeMap: MappingChars2String,
    //   minifiedJs: true,
    //   arbitraryValues: {
    //     allowDoubleQuotes: true
    //   }
    // })

    // const { jsHandler } = getCompilerContext()
    // defaultJsHandler = jsHandler
  })

  afterEach(() => {
    if (originalBase === undefined) {
      delete process.env.WEAPP_TAILWINDCSS_BASEDIR
    }
    else {
      process.env.WEAPP_TAILWINDCSS_BASEDIR = originalBase
    }
  })

  it.each(testTable)("'$name' break taro-terser-minify case", async ({ strategy }) => {
    const testCase = await getCase('taro-terser-minify.js')
    const set: Set<string> = new Set()
    process.env.NODE_ENV = 'production'
    const xxx = strategy === 'replace' ? rh : h
    const { code } = await xxx(testCase, set)
    const { code: code0 } = await mh(testCase, set)
    if (strategy !== 'replace') {
      expect(code).toBe(code0)
    }

    expect(code).toMatchSnapshot()
    // const css = getCss([testCase])
    // const context = getContexts()
    // const set = getClassCacheSet()
    // expect(set.size).toBeGreaterThan(0)
  })

  it.each(testTable)("'$name' vue3SaticNodeStr case", async ({ strategy }) => {
    const testCase = await getCase('taro-vue-static-node.js')
    await getCss(testCase)
    const set: Set<string> = new Set()
    const xxx = strategy === 'replace' ? rh : h
    const { code } = await xxx(testCase, set)
    expect(code).toMatchSnapshot()
  })

  it.each(testTable)("'$name' vue3SaticNodeStr short case", async ({ strategy }) => {
    const testCase = await getCase('taro-vue-static-node-short.js')
    await getCss(testCase)
    const set: Set<string> = new Set()
    const xxx = strategy === 'replace' ? rh : h
    const { code } = await xxx(testCase, set)
    expect(code).toMatchSnapshot()
  })
})
