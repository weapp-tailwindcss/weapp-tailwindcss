import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deploymentOrigins } from '../config/deploymentTarget'
import { verifyDeploymentAssets } from './deployment-verification'
import { parseDeploymentVerificationOptions } from './deployment-verification-options'

function fixture(target: 'production' | 'next', stale = false) {
  const origin = deploymentOrigins[target]
  const content = new TextEncoder().encode('this build')
  const asset = { pathname: '/assets/css/main.123.css', content, sha256: createHash('sha256').update(content).digest('hex') }
  const headers: Record<string, string> = target === 'next' ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}
  const request = vi.fn(async (url: URL) => {
    const pathname = url.pathname
    if (pathname === '/en/docs/intro' || pathname === '/docs/migrations/v2') {
      return new Response(null, { status: 301, headers: { location: pathname.startsWith('/en/') ? '/docs/intro' : '/docs/migrations/v5' } })
    }
    if (pathname.includes('unknown-deployment')) {
      return new Response('', { status: 404, headers })
    }
    if (pathname === '/robots.txt') {
      return new Response(target === 'next' ? 'User-agent: *\nDisallow: /' : `User-agent: *\nDisallow:\nSitemap: ${origin}/sitemap.xml\nSitemap: ${origin}/zh-cn/sitemap.xml`, { headers })
    }
    if (pathname.endsWith('/sitemap.xml')) {
      if (target === 'next') {
        return new Response('', { status: 404, headers })
      }
      return new Response(`<urlset><loc>${origin}${pathname.startsWith('/zh-cn/') ? '/zh-cn' : ''}/docs/intro</loc></urlset>`, { headers })
    }
    if (pathname.includes('llms-index')) {
      return Response.json({ locale: pathname.startsWith('/zh-cn/') ? 'zh-CN' : 'en-US', contentTier: pathname.includes('-full') ? 'full' : 'primary', documents: [{ canonical: `${origin}${pathname.startsWith('/zh-cn/') ? '/zh-cn' : ''}/docs/intro` }] }, { headers })
    }
    if (pathname.endsWith('.txt') || pathname === '/wetw/registry.json') {
      return new Response(origin, { headers })
    }
    if (pathname === asset.pathname) {
      return new Response(stale ? 'old build' : content, { headers: { ...headers, 'cache-control': 'public, max-age=31536000, immutable' } })
    }
    const englishPath = pathname.replace(/^\/zh-cn(?=\/|$)/, '') || '/'
    const chinesePath = `/zh-cn${englishPath}`
    return new Response([
      `<link rel="canonical" href="${origin}${pathname}">`,
      `<link rel="alternate" hreflang="en-US" href="${origin}${englishPath}">`,
      `<link rel="alternate" hreflang="zh-CN" href="${origin}${chinesePath}">`,
      `<link rel="alternate" hreflang="x-default" href="${origin}${englishPath}">`,
      '<script type="application/ld+json">{"@type":"SoftwareSourceCode"}</script>',
      `<link rel="stylesheet" href="${asset.pathname}">`,
      target === 'next' ? '<meta name="robots" content="noindex, nofollow">' : '',
    ].join(''), { headers })
  })
  vi.stubGlobal('fetch', request)
  return { asset, request }
}

afterEach(() => vi.unstubAllGlobals())

describe('双语部署产物验证', () => {
  it.each(['production', 'next'] as const)('%s 同时检查双语、路由、索引隔离与内容哈希', async (target) => {
    const { asset, request } = fixture(target)
    const options = parseDeploymentVerificationOptions(['http://127.0.0.1:12345', '--target', target])
    await expect(verifyDeploymentAssets(options, [asset])).resolves.toBeUndefined()
    const paths = request.mock.calls.map(([url]) => url.pathname)
    expect(paths).toEqual(expect.arrayContaining(['/docs/intro', '/zh-cn/docs/intro', '/sitemap.xml', '/zh-cn/sitemap.xml', asset.pathname]))
  })

  it('旧资源即使路径和缓存头正确也不能通过本轮构建哈希', async () => {
    const { asset } = fixture('next', true)
    const options = parseDeploymentVerificationOptions(['http://127.0.0.1:12345', '--target', 'next'])
    await expect(verifyDeploymentAssets(options, [asset])).rejects.toThrow('does not match this build')
  })

  it('取消验收后禁止继续请求静态资源', async () => {
    const { asset, request } = fixture('next')
    const options = parseDeploymentVerificationOptions(['http://127.0.0.1:12345', '--target', 'next'])
    const controller = new AbortController()
    const reason = new Error('本轮验收已取消')
    controller.abort(reason)
    await expect(verifyDeploymentAssets(options, [asset], controller.signal)).rejects.toBe(reason)
    expect(request).not.toHaveBeenCalled()
  })

  it('生产 canonical 产物不能通过 next 验证', async () => {
    const { asset } = fixture('production')
    const options = parseDeploymentVerificationOptions(['http://127.0.0.1:12345', '--target', 'next'])
    await expect(verifyDeploymentAssets(options, [asset])).rejects.toThrow('索引策略不匹配')
  })
})
