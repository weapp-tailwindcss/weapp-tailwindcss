import { describe, expect, it } from 'vitest'

describe('defaults getDefaultOptions', () => {
  it.each(['screens/card', '/screens/card', 'C:\\screens\\card', 'screens\\card'])('recognizes DingTalk output assets at %s', async (base) => {
    const { getDefaultOptions } = await import('@/defaults')
    const options = getDefaultOptions()
    expect(typeof options.cssMatcher === 'function' && options.cssMatcher(`${base}.ddss`)).toBe(true)
    expect(typeof options.htmlMatcher === 'function' && options.htmlMatcher(`${base}.ddml`)).toBe(true)
    expect(typeof options.cssMatcher === 'function' && options.cssMatcher(`${base}.ddss.map`)).toBe(false)
    expect(typeof options.htmlMatcher === 'function' && options.htmlMatcher(`${base}.ddml.js`)).toBe(false)
  })

  it('ignores call expression identifiers by default', async () => {
    const { getDefaultOptions } = await import('@/defaults')
    const options = getDefaultOptions()

    expect(options.ignoreCallExpressionIdentifiers).toEqual([])
  })

  it('does not guess main css chunks by file name by default', async () => {
    const { getDefaultOptions } = await import('@/defaults')
    const options = getDefaultOptions()

    const matcher = options.mainCssChunkMatcher!

    for (const appType of ['uni-app', 'uni-app-vite', 'uni-app-x', 'taro', 'mpx', 'remax', 'native', 'weapp-vite', 'kbone'] as const) {
      expect(matcher('app.css', appType)).toBe(false)
      expect(matcher('common/main.css', appType)).toBe(false)
      expect(matcher('bundle.css', appType)).toBe(false)
      expect(matcher('miniprogram-app.css', appType)).toBe(false)
      expect(matcher('common/miniprogram-app.css', appType)).toBe(false)
      expect(matcher('styles/app364cd4a4.wxss', appType)).toBe(false)
      expect(matcher('styles/sub/a.wxss', appType)).toBe(false)
      expect(matcher('wx/styles/app364cd4a4.wxss', appType)).toBe(false)
      expect(matcher('main.css', appType)).toBe(false)
      expect(matcher('other.css', appType)).toBe(false)
    }

    expect(matcher('app.wxss')).toBe(false)
    expect(matcher('common/main.wxss')).toBe(false)
    expect(matcher('bundle.wxss')).toBe(false)
    expect(matcher('styles/app364cd4a4.wxss')).toBe(false)
    expect(matcher('pages/index/index.wxss')).toBe(false)
    expect(matcher('anything.css', 'unknown-type' as any)).toBe(false)
  })

  it('filters css and html and js files correctly', async () => {
    const { getDefaultOptions } = await import('@/defaults')
    const options = getDefaultOptions()

    expect(typeof options.cssMatcher === 'function' && options.cssMatcher('foo.wxss')).toBe(true)
    expect(typeof options.cssMatcher === 'function' && options.cssMatcher('foo.css')).toBe(true)
    expect(typeof options.cssMatcher === 'function' && options.cssMatcher('foo.scss')).toBe(false)

    expect(typeof options.htmlMatcher === 'function' && options.htmlMatcher('foo.wxml')).toBe(true)
    expect(typeof options.htmlMatcher === 'function' && options.htmlMatcher('foo.axml')).toBe(true)
    expect(typeof options.htmlMatcher === 'function' && options.htmlMatcher('foo.qxml')).toBe(true)
    expect(typeof options.htmlMatcher === 'function' && options.htmlMatcher('foo.html')).toBe(false)

    expect(typeof options.jsMatcher === 'function' && options.jsMatcher('foo.js')).toBe(true)
    expect(typeof options.jsMatcher === 'function' && options.jsMatcher('foo.mjs')).toBe(true)
    expect(typeof options.jsMatcher === 'function' && options.jsMatcher('foo.jsx')).toBe(false)
    expect(typeof options.jsMatcher === 'function' && options.jsMatcher('node_modules/foo.js')).toBe(false)
    expect(typeof options.wxsMatcher === 'function' && options.wxsMatcher('foo.wxs')).toBe(false)
  })

  it('disables runtime package replacement by default', async () => {
    const { getDefaultOptions } = await import('@/defaults')
    const options = getDefaultOptions()

    expect(options.replaceRuntimePackages).toBe(false)
  })
})
