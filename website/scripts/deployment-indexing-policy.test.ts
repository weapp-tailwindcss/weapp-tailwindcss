import { describe, expect, it } from 'vitest'
import { verifyIndexingHeaders, verifyIndexingHtml, verifyRobotsPolicy } from './deployment-indexing-policy'

describe('文档部署索引隔离', () => {
  const origin = 'https://tw.weapp.dev'
  const productionRobots = `User-agent: *\nDisallow:\nAllow: /\nSitemap: ${origin}/sitemap.xml\nSitemap: ${origin}/zh-cn/sitemap.xml`
  const nextRobots = 'User-agent: *\nDisallow: /\n'
  const nextHtml = '<meta content="nofollow, noindex" name="robots">'
  const nextHeaders = new Headers({ 'X-Robots-Tag': 'noindex, nofollow' })

  it('生产站允许索引并要求双语站点地图', () => {
    expect(() => verifyIndexingHtml('<meta name="robots" content="index, follow">', 'production', '/')).not.toThrow()
    expect(() => verifyIndexingHeaders(new Headers(), 'production', '/')).not.toThrow()
    expect(() => verifyRobotsPolicy(productionRobots, 'production', origin)).not.toThrow()
    expect(() => verifyRobotsPolicy(productionRobots.replace('/zh-cn/sitemap.xml', '/wrong.xml'), 'production', origin)).toThrow('双语')
  })

  it('next 同时要求 HTML、响应头与 robots 禁止索引', () => {
    expect(() => verifyIndexingHtml(nextHtml, 'next', '/zh-cn/docs/intro')).not.toThrow()
    expect(() => verifyIndexingHeaders(nextHeaders, 'next', '/assets/main.css')).not.toThrow()
    expect(() => verifyRobotsPolicy(nextRobots, 'next', 'https://next.tw.weapp.dev')).not.toThrow()
    expect(() => verifyIndexingHtml('<html/>', 'next', '/')).toThrow('meta')
    expect(() => verifyIndexingHeaders(new Headers(), 'next', '/')).toThrow('X-Robots-Tag')
    expect(() => verifyRobotsPolicy(productionRobots, 'next', origin)).toThrow('禁止所有爬虫')
    expect(() => verifyRobotsPolicy(`${nextRobots}Allow: /docs`, 'next', origin)).toThrow('禁止所有爬虫')
  })

  it('生产站拒绝误用 next 的任一禁止索引产物', () => {
    expect(() => verifyIndexingHtml(nextHtml, 'production', '/')).toThrow('meta')
    expect(() => verifyIndexingHeaders(nextHeaders, 'production', '/')).toThrow('X-Robots-Tag')
    expect(() => verifyRobotsPolicy(nextRobots, 'production', origin)).toThrow('允许索引')
  })
})
