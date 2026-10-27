import type { HashedDeploymentAsset } from './deployment-assets'
import type { DeploymentVerificationOptions } from './deployment-verification-options'
import { digest } from './deployment-assets'
import { verifyIndexingHeaders, verifyIndexingHtml, verifyRobotsPolicy } from './deployment-indexing-policy'

export { getExpectedHashedAssets } from './deployment-assets'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

type DeploymentRequest = (pathname: string, status: number) => Promise<Response>

function createDeploymentRequest({ siteUrl, target }: DeploymentVerificationOptions, signal?: AbortSignal): DeploymentRequest {
  return async (pathname, status) => {
    signal?.throwIfAborted()
    const response = await fetch(new URL(pathname, siteUrl), {
      redirect: 'manual',
      headers: { 'cache-control': 'no-cache' },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    })
    assert(response.status === status, `${pathname} expected ${status}, received ${response.status}`)
    if (status !== 301) {
      verifyIndexingHeaders(response.headers, target, pathname)
    }
    return response
  }
}

async function verifyHtmlMetadata(request: DeploymentRequest, canonicalOrigin: string, pathname: string, locale: 'en-US' | 'zh-CN', target: DeploymentVerificationOptions['target']) {
  const response = await request(pathname, 200)
  const html = await response.text()
  verifyIndexingHtml(html, target, pathname)
  const linkTags = [...html.matchAll(/<link\b[^>]*>/g)].map(match => match[0])
  const canonicalPath = locale === 'zh-CN' ? pathname : pathname.replace(/^\/en(?=\/|$)/, '')
  const englishPath = locale === 'zh-CN' ? pathname.replace(/^\/zh-cn(?=\/|$)/, '') || '/' : canonicalPath
  const chinesePath = locale === 'zh-CN' ? pathname : `/zh-cn${canonicalPath}`
  const hasLink = (rel: string, href: string, hreflang?: string) => linkTags.some(tag => tag.includes(`rel="${rel}"`)
    && tag.includes(`href="${href}"`)
    && (!hreflang || tag.includes(`hreflang="${hreflang}"`)))
  assert(hasLink('canonical', `${canonicalOrigin}${canonicalPath}`), `${pathname} canonical is missing or incorrect`)
  assert(hasLink('alternate', `${canonicalOrigin}${englishPath}`, 'en-US'), `${pathname} en-US hreflang is missing or incorrect`)
  assert(hasLink('alternate', `${canonicalOrigin}${chinesePath}`, 'zh-CN'), `${pathname} zh-CN hreflang is missing or incorrect`)
  assert(hasLink('alternate', `${canonicalOrigin}${englishPath}`, 'x-default'), `${pathname} x-default hreflang is missing or incorrect`)
  assert(html.includes('"@type":"SoftwareSourceCode"'), `${pathname} is missing SoftwareSourceCode JSON-LD`)
  assert(!html.includes('name="geo.region"') && !html.includes('name="ICBM"'), `${pathname} still contains geographic GEO metadata`)
}

async function verifySitemap(request: DeploymentRequest, canonicalOrigin: string, pathname: string, locale: 'en-US' | 'zh-CN') {
  const sitemap = await (await request(pathname, 200)).text()
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
  assert(locations.length > 0, `${pathname} has no locations`)
  for (const location of locations) {
    const url = new URL(location)
    assert(url.origin === canonicalOrigin, `${pathname} contains a location from an unexpected origin`)
    const hasChinesePrefix = url.pathname.startsWith('/zh-cn/')
    assert(locale === 'zh-CN' ? hasChinesePrefix : !hasChinesePrefix, `${pathname} contains a location from an unexpected locale`)
  }
}

async function verifyGeoAssets(request: DeploymentRequest, canonicalOrigin: string) {
  const assets = [
    ['/llms-index.json', 'en-US', 'primary'],
    ['/llms-index-full.json', 'en-US', 'full'],
    ['/zh-cn/llms-index.json', 'zh-CN', 'primary'],
    ['/zh-cn/llms-index-full.json', 'zh-CN', 'full'],
  ] as const
  for (const [pathname, locale, tier] of assets) {
    const response = await request(pathname, 200)
    const payload = await response.json() as { locale?: string, contentTier?: string, documents?: Array<{ canonical?: string }> }
    assert(payload.locale === locale, `${pathname} locale is incorrect`)
    assert(payload.contentTier === tier, `${pathname} content tier is incorrect`)
    assert(Array.isArray(payload.documents) && payload.documents.length > 0, `${pathname} has no documents`)
    assert(payload.documents.every(item => new URL(String(item.canonical)).origin === canonicalOrigin), `${pathname} contains canonicals from an unexpected origin`)
    if (locale === 'en-US') {
      assert(payload.documents.every(item => !new URL(String(item.canonical)).pathname.startsWith('/en/')), `${pathname} contains /en canonicals`)
    }
  }
}

async function verifyMachineReadableAssets(request: DeploymentRequest, canonicalOrigin: string) {
  const assets = [
    '/llms.txt',
    '/llms-full.txt',
    '/llms-quickstart.txt',
    '/llms-api.txt',
    '/wetw/registry.json',
  ]
  for (const pathname of assets) {
    const response = await request(pathname, 200)
    const content = await response.text()
    if (pathname !== '/wetw/registry.json') {
      assert(content.includes(canonicalOrigin), `${pathname} does not reference the canonical origin`)
    }
    assert(!content.includes('tw.icebreaker.top'), `${pathname} still contains the legacy origin`)
    assert(!content.includes('next.tw.icebreaker.top'), `${pathname} still contains the legacy preview origin`)
  }
}

async function verifyHashedAssets(options: DeploymentVerificationOptions, assets: HashedDeploymentAsset[], signal?: AbortSignal) {
  const controller = new AbortController()
  const request = createDeploymentRequest(options, signal ? AbortSignal.any([signal, controller.signal]) : controller.signal)
  let next = 0
  let failed = false
  let failure: unknown
  const workers = Array.from({ length: Math.min(8, assets.length) }, async () => {
    while (!failed && next < assets.length) {
      const asset = assets[next++]
      try {
        const response = await request(asset.pathname, 200)
        if (asset.pathname.startsWith('/assets/')) {
          assert(response.headers.get('cache-control') === 'public, max-age=31536000, immutable', `${asset.pathname} immutable cache policy is missing or incorrect`)
        }
        const remoteSha256 = digest(new Uint8Array(await response.arrayBuffer()))
        assert(remoteSha256 === asset.sha256, `${asset.pathname} does not match this build`)
      }
      catch (error) {
        if (!failed) {
          failed = true
          failure = error
          controller.abort(error)
        }
        throw error
      }
    }
  })
  await Promise.allSettled(workers)
  if (failed) {
    throw failure
  }
}

export async function verifyDeploymentAssets(options: DeploymentVerificationOptions, assets: HashedDeploymentAsset[], signal?: AbortSignal) {
  const { canonicalOrigin, target } = options
  const request = createDeploymentRequest(options, signal)
  await verifyHtmlMetadata(request, canonicalOrigin, '/', 'en-US', target)
  await verifyHtmlMetadata(request, canonicalOrigin, '/docs/intro', 'en-US', target)
  await verifyHtmlMetadata(request, canonicalOrigin, '/zh-cn/', 'zh-CN', target)
  await verifyHtmlMetadata(request, canonicalOrigin, '/zh-cn/docs/intro', 'zh-CN', target)
  await verifyHtmlMetadata(request, canonicalOrigin, '/blog/2025/9/v4.3-release', 'en-US', target)
  await verifyHtmlMetadata(request, canonicalOrigin, '/zh-cn/blog/2025/9/v4.3-release', 'zh-CN', target)

  const englishRedirect = await request('/en/docs/intro', 301)
  assert(englishRedirect.headers.get('location') === '/docs/intro', '/en redirect location is incorrect')
  const legacyRedirect = await request('/docs/migrations/v2', 301)
  assert(legacyRedirect.headers.get('location') === '/docs/migrations/v5', 'legacy redirect location is incorrect')

  await request(`/unknown-deployment-${Date.now()}`, 404)
  await request(`/zh-cn/unknown-deployment-${Date.now()}`, 404)

  const robotsResponse = await request('/robots.txt', 200)
  verifyRobotsPolicy(await robotsResponse.text(), target, canonicalOrigin)
  if (target === 'production') {
    await verifySitemap(request, canonicalOrigin, '/sitemap.xml', 'en-US')
    await verifySitemap(request, canonicalOrigin, '/zh-cn/sitemap.xml', 'zh-CN')
  }
  else {
    await request('/sitemap.xml', 404)
    await request('/zh-cn/sitemap.xml', 404)
  }
  await verifyGeoAssets(request, canonicalOrigin)
  await verifyMachineReadableAssets(request, canonicalOrigin)

  const homepage = await (await request('/', 200)).text()
  assert(assets.some(asset => asset.pathname.endsWith('.css') && homepage.includes(`href="${asset.pathname}"`)), 'homepage does not reference a stylesheet from this build')
  await verifyHashedAssets(options, assets, signal)
}
