import { describe, expect, it } from 'vitest'
import { verifyIndexingHeaders, verifyIndexingHtml, verifyRobotsPolicy } from './deployment-indexing-policy'

describe('文档部署索引隔离', () => {
  const origin = 'https://tw.weapp.dev'
  const productionRobots = `User-agent: *\nDisallow:\nAllow: /\nSitemap: ${origin}/sitemap.xml\nSitemap: ${origin}/zh-cn/sitemap.xml`
  const nextRobots = 'User-agent: *\nDisallow: /\n'
  const nextHtml = '<meta content="nofollow, noindex" name="robots">'
  const nextHeaders = new Headers({ 'X-Robots-Tag': 'noindex, nofollow' })
  const managedRobots = [
    '# BEGIN Cloudflare Managed content',
    'User-Agent: *',
    'Content-signal: search=yes, ai-train=no, use=reference',
    'Allow: /',
    'User-agent: GPTBot',
    'Disallow: /',
    'User-agent: Google-Extended',
    'Disallow: /',
    '# END Cloudflare Managed content',
  ].join('\n')

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

  it('生产站允许默认索引与具名 AI 爬虫禁爬并存', () => {
    expect(() => verifyRobotsPolicy(`${managedRobots}\n${productionRobots}`, 'production', origin)).not.toThrow()
    expect(() => verifyRobotsPolicy(`${productionRobots}\n${managedRobots}`, 'production', origin)).not.toThrow()
  })

  it.each([
    `${managedRobots}\n${nextRobots}`,
    `${nextRobots}\n${managedRobots}`,
  ])('next 合并全部同名组后仍拒绝边缘注入的 Allow：%s', (robots) => {
    expect(() => verifyRobotsPolicy(robots, 'next', origin)).toThrow('禁止所有爬虫')
  })

  it('具名爬虫的允许规则不能解除默认组的生产禁爬', () => {
    const robots = `${nextRobots}User-agent: Googlebot\nAllow: /\nSitemap: ${origin}/sitemap.xml\nSitemap: ${origin}/zh-cn/sitemap.xml`
    expect(() => verifyRobotsPolicy(robots, 'production', origin)).toThrow('允许索引')
  })

  it.each(['Allow: /docs', 'Disallow: /private', ''])('next 的具名组不能绕过默认禁爬：%s', (rule) => {
    expect(() => verifyRobotsPolicy(`${nextRobots}User-agent: ExampleBot\n${rule}`, 'next', origin)).toThrow('禁止所有爬虫')
  })

  it('连续 agent 共用规则，扩展字段、注释和空行不拆散分组', () => {
    const robots = '# comment\r\n USER-AGENT : *\r\n\r\nContent-Signal: search=no\r\nUser-agent: ExampleBot\r\nDISALLOW : / # all paths\r\nAllow:\r\n'
    expect(() => verifyRobotsPolicy(robots, 'next', origin)).not.toThrow()
  })

  it('具名组独立禁爬时 next 允许通过', () => {
    expect(() => verifyRobotsPolicy(`${nextRobots}User-agent: ExampleBot\nDisallow: /\n`, 'next', origin)).not.toThrow()
  })

  it('分组外的路径规则不生效，sitemap 则是全局记录', () => {
    const robots = `Disallow: /\nSITEMAP: ${origin}/sitemap.xml\nUser-agent: *\nDisallow:\nUser-agent: GPTBot\nDisallow: /\nsitemap: ${origin}/zh-cn/sitemap.xml`
    expect(() => verifyRobotsPolicy(robots, 'production', origin)).not.toThrow()
    expect(() => verifyRobotsPolicy('Disallow: /\nUser-agent: *\n', 'next', origin)).toThrow('禁止所有爬虫')
  })

  it('next 拒绝任意组位置声明的站点地图', () => {
    expect(() => verifyRobotsPolicy(`${nextRobots}SITEMAP: ${origin}/sitemap.xml`, 'next', origin)).toThrow('不发布 sitemap')
  })

  it('生产根路由的通配和精确禁爬不能漏检，同等允许规则优先', () => {
    for (const path of ['/', '/*', '/$', '*', '*/', '*/*$']) {
      const robots = productionRobots.replace('Disallow:\nAllow: /', `Disallow: ${path}`)
      expect(() => verifyRobotsPolicy(robots, 'production', origin)).toThrow('允许索引')
    }
    expect(() => verifyRobotsPolicy(`${nextRobots}Allow: /\nSitemap: ${origin}/sitemap.xml\nSitemap: ${origin}/zh-cn/sitemap.xml`, 'production', origin)).not.toThrow()
    expect(() => verifyRobotsPolicy(productionRobots.replace('Disallow:', 'Disallow: /$'), 'production', origin)).toThrow('允许索引')
    expect(() => verifyRobotsPolicy(productionRobots.replace('Disallow:\nAllow: /', 'Disallow: /\nAllow: /$'), 'production', origin)).not.toThrow()
  })
})
