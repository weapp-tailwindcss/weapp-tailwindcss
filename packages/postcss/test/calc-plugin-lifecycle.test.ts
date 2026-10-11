import type { Plugin } from 'postcss'
import { createStyleHandler } from '@/handler'
import { applyConfiguredCssCalc } from '@/plugins/applyConfiguredCssCalc'

const source = ':root { --scale: 1rpx } .sample { width: calc(var(--scale, 3rpx) * 10) }'

describe('calc uses the completed author plugin stage', () => {
  it.each(['Once', 'OnceExit'] as const)('observes overrides appended in %s', async (hook) => {
    const plugin: Plugin = { postcssPlugin: 'author-override', [hook](root) { root.append('.local { --scale: 2rpx }') } }
    const handler = createStyleHandler({ cssCalc: ['--scale'], postcssOptions: { plugins: [plugin] } })
    expect((await handler(source)).css).toContain('width: calc(var(--scale')
  })

  it('reads changed declarations after all author visitors and before unit conversion', async () => {
    const plugin: Plugin = {
      postcssPlugin: 'author-value',
      Declaration(decl) {
        if (decl.prop === '--scale') {
          decl.value = '0.5rem'
        }
      },
    }
    const handler = createStyleHandler({ cssCalc: ['--scale'], rem2rpx: true, postcssOptions: { plugins: [plugin] } })
    expect((await handler(source)).css).toContain('width: 160rpx')
  })

  it('does not reuse stale values between author plugin runs', async () => {
    const plugin: Plugin = { postcssPlugin: 'author-value', Once(root) { root.walkDecls('--scale', decl => { decl.value = decl.value.trim() === '1rpx' ? '2rpx' : '3rpx' }) } }
    const handler = createStyleHandler({ cssCalc: ['--scale'], postcssOptions: { plugins: [plugin] } })
    expect((await handler(source)).css).toContain('width: 20rpx')
    expect((await handler(source.replace('1rpx', '8rpx'))).css).toContain('width: 30rpx')
  })
})

describe('calc requires a document theme root', () => {
  it.each(['.tw-root', ':host', 'wx-root-portal-content'])('does not treat standalone %s as a global value', async (selector) => {
    const css = await applyConfiguredCssCalc(source.replace(':root', selector), { cssCalc: ['--scale'] })
    expect(css).toContain('width: calc(var(--scale')
  })

  it.each(['property', 'PROPERTY', 'Property'])('recognizes case-insensitive @%s registrations', async (name) => {
    const css = await applyConfiguredCssCalc(`@${name} --scale { syntax: "<length>"; inherits: false; initial-value: 2rpx } .sample { width: calc(var(--scale) * 10) }`, {
      cssCalc: ['--scale'], customPropertyValues: new Map([['--scale', '1rpx']]),
    })
    expect(css).toContain('width: calc(var(--scale')
  })
})
