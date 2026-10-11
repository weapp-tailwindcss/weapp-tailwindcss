import { expect, it } from 'vitest'
import { resolveWechatAppId } from '../scripts/wechat-app-id'

it('预检与 IDE 沿用仓库授权 AppID', () => {
  expect(resolveWechatAppId({})).toBe('wx6ffee4673b257014')
})

it.each(['E2E_PREFLIGHT_WECHAT_APPID', 'E2E_TEMPLATE_IDE_APP_ID'])('单独配置 %s 时选择同一 AppID', (key) => {
  expect(resolveWechatAppId({ [key]: 'wx0123456789abcdef' })).toBe('wx0123456789abcdef')
})

it('两别名相同可用，不同则拒绝静默覆盖', () => {
  expect(resolveWechatAppId({ E2E_PREFLIGHT_WECHAT_APPID: 'wx0123456789abcdef', E2E_TEMPLATE_IDE_APP_ID: 'wx0123456789abcdef' })).toBe('wx0123456789abcdef')
  expect(() => resolveWechatAppId({ E2E_PREFLIGHT_WECHAT_APPID: 'wx0123456789abcdef', E2E_TEMPLATE_IDE_APP_ID: 'wxabcdef0123456789' })).toThrow('AppID 配置冲突')
})

it.each(['', 'touristappid', 'invalid'])('在启动前拒绝任一别名的无效 AppID：%j', (appId) => {
  for (const key of ['E2E_PREFLIGHT_WECHAT_APPID', 'E2E_TEMPLATE_IDE_APP_ID']) {
    expect(() => resolveWechatAppId({ [key]: appId })).toThrow('AppID')
  }
})
