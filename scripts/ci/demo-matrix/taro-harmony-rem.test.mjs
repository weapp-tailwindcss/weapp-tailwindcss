import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { evaluateCommonJs, packageFile, packageSource, taroRequire } from './taro-package.fixture.mjs'

const { getHtmlScript } = taroRequire(packageFile('vite-runner', 'dist/utils/html.js'))
const options = { config: { designWidth: 750, deviceRatio: { 750: 1 }, baseFontSize: 20 } }
function evaluate(html, width, height = 900) {
  const handlers = []
  const element = { style: {}, getBoundingClientRect: () => ({ width, height }) }
  const context = { window: { document: { documentElement: element }, addEventListener: (_type, handler) => handlers.push(handler) }, setTimeout: callback => callback() }
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    runInNewContext(script, context)
  }
  return {
    handlers,
    style: element.style,
    resize(next) {
      width = next
      for (const handler of handlers) {
        handler()
      }
    },
  }
}

it.each([375, 599, 600, 839, 840, 1200, 1439, 1440])('Harmony %s 宽度使用与框架 pxtransform 一致的 rem 策略', (width) => {
  const html = getHtmlScript('/entry.js', options, 'harmony-hybrid')
  const result = evaluate(html, width)
  expect(result.style.fontSize).toBe(`${width < 600 ? 40 * width / 750 : 20}px`)
  expect(result.handlers).toHaveLength(1)
  expect(html.match(/type="module"/g)).toHaveLength(1)
  result.resize(375)
  expect(result.style.fontSize).toBe('20px')
})

it('函数 designWidth、deviceRatio 与 baseFontSize 使用同一组配置', () => {
  const input = { config: { designWidth: base => base === 16 ? 640 : 0, deviceRatio: { 640: 2 }, baseFontSize: 16 } }
  expect(evaluate(getHtmlScript('/entry.js', input, 'harmony-hybrid'), 1200).style.fontSize).toBe('8px')
})

it('非 rem 不注册 resize 且保留 module 入口', () => {
  const html = getHtmlScript('/entry.js', { config: { ...options.config, targetUnit: 'px' } }, 'harmony-hybrid')
  expect(evaluate(html, 375).handlers).toHaveLength(0)
  expect(html).toContain('src="/entry.js"')
})

it('普通 H5 继续使用短边与 min/max，resize 仍有效', () => {
  const result = evaluate(getHtmlScript('/entry.js', options, 'h5'), 1200, 900)
  expect(result.style.fontSize).toBe('40px')
  result.resize(375)
  expect(result.style.fontSize).toBe('20px')
})

it.each(['config', 'mpa'].flatMap(entry => ['h5', 'harmony-hybrid'].map(platform => [entry, platform])))('%s 的 transformIndexHtml 传递 %s 平台到真实 rem 生成器', (entry, platform) => {
  const filename = packageFile('vite-runner', `dist/h5/${entry}.js`)
  const entryRequire = taroRequire('node:module').createRequire(filename)
  const require = (id) => {
    if (id === '../postcss/postcss.h5') {
      return { getDefaultPostcssConfig: () => [['postcss-pxtransform', options]] }
    }
    if (id === '@tarojs/helper') {
      const helper = entryRequire(id)
      return { ...helper, fs: { ...helper.fs, readFileSync: () => '<html></html>' } }
    }
    return entryRequire(id)
  }
  const sourceDir = path.resolve('fixture-source')
  const plugin = evaluateCommonJs(packageSource('vite-runner', `dist/h5/${entry}.js`), require).default({
    sourceDir,
    cwd: path.dirname(sourceDir),
    app: { configPath: path.join(sourceDir, 'app.config.ts') },
    pages: [],
    taroConfig: { ...options.config, buildAdapter: platform },
  })
  const html = plugin.transformIndexHtml.transform('<script><%= htmlWebpackPlugin.options.script %></script>', { path: '/index.html' })
  expect(evaluate(html, 1200).style.fontSize).toBe(platform === 'h5' ? '40px' : '20px')
  expect(html.match(/type="module"/g)).toHaveLength(1)
})
