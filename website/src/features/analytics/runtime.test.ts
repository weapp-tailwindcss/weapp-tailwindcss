import { describe, expect, it } from 'vitest'
import { isProductionAnalyticsOrigin } from './runtime'

describe('统计的正式主域边界', () => {
  it.each([
    ['https://tw.weapp.dev', 'https://tw.weapp.dev', true],
    ['https://tw.weapp.dev', 'https://tw.weapp.dev/docs/options/reset', true],
    ['https://tw.weapp.dev', 'https://TW.WEAPP.DEV:443/docs/', true],
    ['http://tw.weapp.dev', 'https://tw.weapp.dev', false],
    ['https://tw.weapp.dev:8443', 'https://tw.weapp.dev', false],
    ['https://preview.tw.weapp.dev', 'https://tw.weapp.dev', false],
    ['https://tw.weapp.dev.example.test', 'https://tw.weapp.dev', false],
    ['http://localhost:4000', 'https://tw.weapp.dev', false],
    ['http://127.0.0.1:4000', 'https://tw.weapp.dev', false],
    ['https://next.tw.weapp.dev', 'https://next.tw.weapp.dev/docs/', false],
    ['https://tw.weapp.dev', 'https://next.tw.weapp.dev', false],
    ['null', 'file:///docs/index.html', false],
  ])('运行来源 %s 与配置 %s 的匹配结果是 %s', (origin, url, expected) => {
    expect(isProductionAnalyticsOrigin(origin, url)).toBe(expected)
  })
})
