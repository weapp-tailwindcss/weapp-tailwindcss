import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deploymentOrigins } from '../config/deploymentTarget'
import { verifyDeploymentAssets } from './deployment-verification'
import { parseDeploymentVerificationOptions } from './deployment-verification-options'

interface Asset {
  pathname: string
  content: Uint8Array
  sha256: string
}

function fixture(target: 'production' | 'next', options: {
  stalePath?: string
  extraPaths?: string[]
  respondAsset?: (asset: Asset, response: Response, signal?: AbortSignal) => Response
} = {}) {
  const origin = deploymentOrigins[target]
  const content = new TextEncoder().encode('this build')
  const asset = { pathname: '/assets/css/main.123.css', content, sha256: createHash('sha256').update(content).digest('hex') }
  const assets = [asset, ...(options.extraPaths ?? []).map(pathname => ({ ...asset, pathname }))]
  const headers: Record<string, string> = target === 'next' ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}
  const request = vi.fn(async (url: URL, init?: RequestInit) => {
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
    const expectedAsset = assets.find(asset => asset.pathname === pathname)
    if (expectedAsset) {
      const response = new Response(pathname === options.stalePath ? 'old build' : content, { headers: { ...headers, 'cache-control': 'public, max-age=31536000, immutable' } })
      return options.respondAsset?.(expectedAsset, response, init?.signal ?? undefined) ?? response
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
  return { asset, assets, request }
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
    const { asset } = fixture('next', { stalePath: '/assets/css/main.123.css' })
    const options = parseDeploymentVerificationOptions(['http://127.0.0.1:12345', '--target', 'next'])
    await expect(verifyDeploymentAssets(options, [asset])).rejects.toThrow('does not match this build')
  })

  it.each(['/assets/js/main.123.js', '/zh-cn/assets/js/main.123.js'])('拒绝路径与缓存头正确但内容属于旧构建的 JS：%s', async (pathname) => {
    const { assets } = fixture('next', { stalePath: pathname, extraPaths: [pathname] })
    const options = parseDeploymentVerificationOptions(['http://127.0.0.1:12345', '--target', 'next'])
    await expect(verifyDeploymentAssets(options, assets)).rejects.toThrow(`${pathname} does not match this build`)
  })

  it('并发上限覆盖完整响应体读取，且允许未被首页引用的页面 CSS', async () => {
    let active = 0
    let maximum = 0
    const { assets, request } = fixture('next', {
      extraPaths: ['/assets/css/lazy.css', ...Array.from({ length: 18 }, (_, index) => `/assets/js/${index}.js`)],
      respondAsset(_asset, response) {
        active += 1
        maximum = Math.max(maximum, active)
        const read = response.arrayBuffer.bind(response)
        response.arrayBuffer = async () => {
          await new Promise(resolve => setTimeout(resolve, 0))
          try {
            return await read()
          }
          finally {
            active -= 1
          }
        }
        return response
      },
    })
    const options = parseDeploymentVerificationOptions(['http://127.0.0.1:12345', '--target', 'next'])
    await verifyDeploymentAssets(options, assets)
    expect(maximum).toBe(8)
    expect(active).toBe(0)
    expect(request.mock.calls.filter(([url]) => url.pathname.startsWith('/assets/'))).toHaveLength(assets.length)
  })

  it('失败后停止排队请求，并等待本批已开始的响应结束', async () => {
    let active = 0
    const { assets, request } = fixture('next', {
      stalePath: '/assets/css/main.123.css',
      extraPaths: Array.from({ length: 18 }, (_, index) => `/assets/js/${index}.js`),
      respondAsset(_asset, response) {
        active += 1
        const read = response.arrayBuffer.bind(response)
        response.arrayBuffer = async () => {
          await new Promise(resolve => setTimeout(resolve, 0))
          try {
            return await read()
          }
          finally {
            active -= 1
          }
        }
        return response
      },
    })
    const options = parseDeploymentVerificationOptions(['http://127.0.0.1:12345', '--target', 'next'])
    await expect(verifyDeploymentAssets(options, assets)).rejects.toThrow('does not match this build')
    expect(active).toBe(0)
    expect(request.mock.calls.filter(([url]) => url.pathname.startsWith('/assets/'))).toHaveLength(8)
  })

  it('响应头失败时取消整批请求，释放尚未消费的响应体', async () => {
    const signals: AbortSignal[] = []
    const { assets } = fixture('next', {
      extraPaths: Array.from({ length: 18 }, (_, index) => `/assets/js/${index}.js`),
      respondAsset(asset, response, signal) {
        signals.push(signal!)
        if (asset.pathname.endsWith('.css')) {
          response.headers.delete('cache-control')
        }
        return response
      },
    })
    const options = parseDeploymentVerificationOptions(['http://127.0.0.1:12345', '--target', 'next'])
    await expect(verifyDeploymentAssets(options, assets)).rejects.toThrow('immutable cache policy is missing or incorrect')
    expect(signals).toHaveLength(8)
    expect(signals.every(signal => signal.aborted)).toBe(true)
  })

  it('其他在途请求的取消错误不会掩盖最初的旧 JS 错误', async () => {
    const pathname = '/assets/js/stale.js'
    const { assets } = fixture('next', {
      stalePath: pathname,
      extraPaths: [pathname],
      respondAsset(asset, response, signal) {
        if (asset.pathname.endsWith('.css')) {
          response.arrayBuffer = () => new Promise((_resolve, reject) => {
            const abort = () => reject(new DOMException('在途响应已取消', 'AbortError'))
            if (signal!.aborted) {
              abort()
            }
            else {
              signal!.addEventListener('abort', abort, { once: true })
            }
          })
        }
        return response
      },
    })
    const options = parseDeploymentVerificationOptions(['http://127.0.0.1:12345', '--target', 'next'])
    await expect(verifyDeploymentAssets(options, assets)).rejects.toThrow(`${pathname} does not match this build`)
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
