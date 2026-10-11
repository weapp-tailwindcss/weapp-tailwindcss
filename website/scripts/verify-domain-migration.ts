import process from 'node:process'

const migrations = [
  ['https://tw.icebreaker.top', 'https://tw.weapp.dev'],
  ['https://weapp-tw.icebreaker.top', 'https://tw.weapp.dev'],
  ['https://next.tw.icebreaker.top', 'https://next.tw.weapp.dev'],
] as const

const paths = [
  '/',
  '/docs/intro?utm_source=domain-migration',
  '/zh-cn/docs/intro',
  '/sitemap.xml',
  '/zh-cn/sitemap.xml',
  '/robots.txt',
  '/llms-index.json',
  '/llms.txt',
  '/llms-full.txt',
  '/wetw/registry.json',
] as const

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function verifyRedirect(sourceOrigin: string, targetOrigin: string, pathname: string) {
  const source = new URL(pathname, sourceOrigin)
  const response = await fetch(source, {
    redirect: 'manual',
    headers: { 'cache-control': 'no-cache' },
  })
  assert(response.status === 301, `${source} expected 301, received ${response.status}`)

  const location = response.headers.get('location')
  assert(location, `${source} does not include a Location header`)
  const target = new URL(location, source)
  assert(target.origin === targetOrigin, `${source} redirects to ${target.origin}, expected ${targetOrigin}`)
  assert(target.pathname === source.pathname, `${source} changed path to ${target.pathname}`)
  assert(target.search === source.search, `${source} changed query string to ${target.search}`)
}

async function main() {
  for (const [sourceOrigin, targetOrigin] of migrations) {
    for (const pathname of paths) {
      await verifyRedirect(sourceOrigin, targetOrigin, pathname)
    }
  }
  console.log('[website] legacy domain 301 migration verification passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
