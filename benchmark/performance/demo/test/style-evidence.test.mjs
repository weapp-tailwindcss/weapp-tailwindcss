import { createRequire } from 'node:module'
import path from 'node:path'
import { expect, it } from 'vitest'
import { selectCases } from '../model.mjs'
import { inspectExtraStyles } from '../style-evidence.mjs'
import { preprocessStyle, sfcBlocks } from '../sfc.mjs'

const item = selectCases('uni-app-vite-tailwindcss-v4:mp-weixin')[0]
const consumed = { 'h-8': ['h-8', 'cost-author', 'bg-cost-config'] }
const css = '.cost-author{width:41rpx}.bg-cost-config{background-color:var(--color-cost-config)}:root{--color-cost-config:#123456}'

it('SFC 分块保留嵌套模板与 JSON 脚本边界', () => {
  const source = '<template><view><template v-if="ok"><view class="h-[1px]"/></template><view class="h-[2px]"/></view></template><script type="application/json">{"usingComponents":{}}</script><style>.a{color:red}</style>'
  const blocks = sfcBlocks(source, 'page.mpx')
  expect(blocks[0].content).toContain('h-[2px]')
  expect(blocks[1].attrs.type).toBe('application/json')
  for (const block of blocks) expect(source.slice(block.offset, block.offset + block.length)).toBe(block.content)
})

it('内嵌 SCSS 先解析变量和嵌套，保留 Tailwind 指令交给发布版生成器', async () => {
  const block = sfcBlocks('<style lang="scss" scoped>@reference "./main.css"; $gap: 2px; .a { gap: $gap; @apply flex; .b { color: red; } }</style>', 'page.vue')[0]
  const css = await preprocessStyle(block, path.resolve('page.vue'), createRequire(import.meta.url))
  expect(css).toContain('@reference "./main.css"')
  expect(css).toContain('gap: 2px')
  expect(css).toContain('@apply flex')
  expect(css).toContain('.a .b')
  expect(css).not.toContain('$gap')
})

it('CSS 与配置操作必须有实际消费类名及本轮可达属性', () => {
  expect(inspectExtraStyles([css], consumed, item, 'initial').width).toBe('41rpx')
  expect(() => inspectExtraStyles([css], { 'h-8': ['h-8'] }, item, 'initial')).toThrow('没有被页面实际消费')
  expect(() => inspectExtraStyles([css], consumed, item, 'css')).toThrow('本轮作者样式')
  expect(inspectExtraStyles([css.replace('41rpx', '43rpx')], consumed, item, 'css').width).toBe('43rpx')
  expect(() => inspectExtraStyles([css], consumed, item, 'config')).toThrow('配置失效')
  expect(inspectExtraStyles([css.replace('#123456', '#654321')], consumed, item, 'config').theme).toBe('#654321')
  expect(() => inspectExtraStyles([css.replace('#123456', '#654321')], consumed, item, 'restore')).toThrow('恢复')
})

it('App WebView 的作者探针与既有任意值探针一致使用 px，仍拒绝旧轮次和错误单位', () => {
  const app = { ...item, target: 'app' }
  expect(inspectExtraStyles([css.replace('41rpx', '41px')], consumed, app, 'initial').width).toBe('41px')
  expect(() => inspectExtraStyles([css], consumed, app, 'initial')).toThrow('本轮作者样式')
  expect(() => inspectExtraStyles([css.replace('41rpx', '41px')], consumed, app, 'css')).toThrow('本轮作者样式')
})
