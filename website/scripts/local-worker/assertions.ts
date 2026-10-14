import type { LocalWorkerContext } from './server'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

/** 独立验证 Worker 路由与缓存策略，供单项验证和浏览器验收共用。 */
export async function verifyWorkerRoutes(context: LocalWorkerContext) {
  async function expectResponse(pathname: string, status: number, location?: string) {
    const response = await context.request(pathname)
    if (response.status !== status) {
      throw new Error(`${pathname} expected ${status}, received ${response.status}`)
    }
    if (location && response.headers.get('location') !== location) {
      throw new Error(`${pathname} expected Location ${location}, received ${response.headers.get('location')}`)
    }
    return response
  }
  await expectResponse('/', 200)
  await expectResponse('/zh-cn/', 200)
  await expectResponse('/en/docs/intro', 301, '/docs/intro')
  await expectResponse('/docs/migrations/v2', 301, '/docs/migrations/v5')
  await expectResponse('/unknown-worker-route', 404)
  await expectResponse('/zh-cn/unknown-worker-route', 404)
  const cssFiles = (await readdir(path.join(context.websiteRoot, 'build', 'assets', 'css'))).filter(filename => filename.endsWith('.css')).sort()
  if (cssFiles.length === 0) {
    throw new Error('Wrangler 本地测试找不到构建后的 CSS 资源')
  }
  const cssResponse = await expectResponse(`/assets/css/${cssFiles[0]}`, 200)
  if (cssResponse.headers.get('cache-control') !== 'public, max-age=31536000, immutable') {
    throw new Error('Wrangler 本地静态资源缺少 immutable 缓存策略')
  }
}
