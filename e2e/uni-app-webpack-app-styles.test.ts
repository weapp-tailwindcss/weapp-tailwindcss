import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseSync } from '@babel/core'
import { collectCssRuleEvidence } from '@weapp-tailwindcss/postcss/syntax'
import { afterEach, describe, expect, it } from 'vitest'
import { inspectUniAppWebpackAppStyles } from './uni-app-webpack-app-styles'

const temporary: string[] = []
const css = '.min-h-screen{min-height:100vh}.p-\\[40rpx\\]{padding:20px}.bg-\\[\\#877878\\]{background-color:#877878}'
const service = 'function render(){this._$s(0,"sc","min-h-screen p-[40rpx]")}const data={className:"bg-[#877878]"}'
const html = '<link rel="stylesheet" href="view.css"><script src="app-view.js"></script>'
const ready = '__definePage("pages/index/index",function(){});UniViewJSBridge.publishHandler("webviewReady");'
const injected = (value: string) => `const style=document.createElement("style");style.appendChild(document.createTextNode(${JSON.stringify(value)}));document.head.appendChild(style);${ready}`
const parsers = {
  parseScript: (source: string) => parseSync(source, { babelrc: false, configFile: false, sourceType: 'script' }),
  cssRules: collectCssRuleEvidence,
}

async function fixture(overrides: Record<string, string> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uni-app-style-contract-'))
  temporary.push(root)
  const files = {
    'manifest.json': JSON.stringify({ launch_path: '__uniappview.html' }),
    '__uniappview.html': html,
    'app-view.js': injected(css),
    'app-service.js': service,
    'view.css': 'uni-view{display:block}',
    ...overrides,
  }
  await Promise.all(Object.entries(files).map(([name, content]) => writeFile(path.join(root, name), content)))
  return root
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Vue 2 App 的真实样式注入与 service class 合同', () => {
  it('执行可达入口并以 CSS AST 匹配静态和动态 class', async () => {
    const result = await inspectUniAppWebpackAppStyles(await fixture(), parsers)
    expect(result.styles).toBe(1)
    expect(result.routes).toEqual(['pages/index/index'])
    expect(result.matches.map(item => item.className)).toEqual(['min-h-screen', 'p-[40rpx]', 'bg-[#877878]'])
    expect(result.matches[1]?.rules[0]?.declarations).toContainEqual({ property: 'padding', value: '20px', important: false })
    expect(result.files.every(file => file.sha256.length === 64)).toBe(true)
  })

  it.each([
    '<link rel="stylesheet" href="view.css">',
    `<!-- ${html} -->`,
    '<link rel="stylesheet" href="view.css"><script type="application/json" src="app-view.js"></script>',
    '<link rel="stylesheet" href="view.css"><script data-src="app-view.js"></script>',
    `<link rel="stylesheet" href="view.css"><template>${html}</template>`,
    `<link rel="stylesheet" href="view.css"><noscript>${html}</noscript>`,
    `<link rel="stylesheet" href="view.css"><textarea>${html}</textarea>`,
    '<link rel="stylesheet" href="view.css"><script nomodule src="app-view.js"></script>',
    '<link rel="stylesheet" href="view.css"><script disabled src="app-view.js"></script>',
    `<link rel="stylesheet" href="view.css"><script>const dead=${JSON.stringify('<script src="app-view.js">')};</script>`,
  ])('HTML 中不可达的 view 脚本不能提供样式证据', async (entry) => {
    await expect(inspectUniAppWebpackAppStyles(await fixture({ '__uniappview.html': entry }), parsers)).rejects.toThrow('HTML 未加载 app-view.js')
  })

  it('只有框架 CSS 和 JS 中的 CSS 字面量不能通过', async () => {
    const root = await fixture({ 'app-view.js': `const dead=${JSON.stringify(css)};${ready}`, 'view.css': css })
    await expect(inspectUniAppWebpackAppStyles(root, parsers)).rejects.toThrow('没有注入应用 CSS')
  })

  it('没有挂到文档上的 style 不算实际注入', async () => {
    const source = injected(css).replace('document.head.appendChild(style);', '')
    await expect(inspectUniAppWebpackAppStyles(await fixture({ 'app-view.js': source }), parsers)).rejects.toThrow('没有注入应用 CSS')
  })

  it('service 小程序编码和 Web selector 不一致时拒绝通过', async () => {
    const root = await fixture({ 'app-service.js': service.replace('p-[40rpx]', 'p-_b40rpx_B') })
    await expect(inspectUniAppWebpackAppStyles(root, parsers)).rejects.toThrow('service 没有保留 Web class：p-[40rpx]')
  })

  it('动态 class 没有对应 CSS 时拒绝通过', async () => {
    const source = injected('.min-h-screen{min-height:100vh}.p-\\[40rpx\\]{padding:20px}')
    await expect(inspectUniAppWebpackAppStyles(await fixture({ 'app-view.js': source }), parsers)).rejects.toThrow('CSS 没有匹配 service class：bg-[#877878]')
  })

  it.each([
    '.unrelated .p-\\[40rpx\\]{padding:20px}',
    ':not(.p-\\[40rpx\\]){padding:20px}',
    '@media (min-width:9999px){.p-\\[40rpx\\]{padding:20px}}',
  ])('间接或条件 selector 不能冒充直接生效的业务规则', async (replacement) => {
    const source = injected(css.replace('.p-\\[40rpx\\]{padding:20px}', replacement))
    await expect(inspectUniAppWebpackAppStyles(await fixture({ 'app-view.js': source }), parsers)).rejects.toThrow('CSS 没有匹配 service class：p-[40rpx]')
  })

  it('保留源指令、错误 launch_path 和未完成 view 初始化均阻断', async () => {
    await expect(inspectUniAppWebpackAppStyles(await fixture({ 'app-view.js': injected('@import "tailwindcss";') }), parsers)).rejects.toThrow('残留 Tailwind 源指令')
    await expect(inspectUniAppWebpackAppStyles(await fixture({ 'manifest.json': '{"launch_path":"other.html"}' }), parsers)).rejects.toThrow('manifest 必须绑定')
    await expect(inspectUniAppWebpackAppStyles(await fixture({ 'app-view.js': injected(css).replace('UniViewJSBridge.publishHandler("webviewReady");', '') }), parsers)).rejects.toThrow('没有完成初始化')
  })
})
