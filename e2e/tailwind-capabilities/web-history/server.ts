import type { HistorySidecar } from './types'
import { createServer } from 'node:http'
import { bounded } from '../web-native-media/deadline'
import { historyPaths, renderHistory } from './fixtures'

/** 使用真实同源 HTTP 导航，避免 route fulfil 或虚构 URL 冒充浏览历史。 */
export async function historyServer(css: string, runId: string, raw: HistorySidecar, next: () => number) {
  const paths = historyPaths(runId)
  const server = createServer((request, response) => {
    const pathname = request.url ?? ''
    const fixture = request.method === 'GET' && pathname === paths.fixture
    const target = request.method === 'GET' && pathname === paths.target
    const status = fixture || target ? 200 : 404
    raw.requests.push({ path: pathname, method: request.method ?? '', status, sequence: next() })
    response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(fixture ? renderHistory(css, runId) : '<!doctype html><html><head><link rel="icon" href="data:,"></head><body>History target</body></html>')
  })
  const controller = new AbortController()
  let launchError: Error | undefined
  const timer = setTimeout(() => {
    launchError = new Error('历史夹具 HTTP 启动超过 5000ms 预算')
    controller.abort()
  }, 5_000)
  async function close() {
    await bounded('历史夹具 HTTP 关闭', () => new Promise<void>((resolve, reject) => server.close((error) => {
      if (error && !('code' in error && error.code === 'ERR_SERVER_NOT_RUNNING')) {
        reject(error)
      }
      else {
        resolve()
      }
    })))
    raw.cleanup.serverClosed = true
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.once('close', () => reject(launchError ?? new Error('历史 HTTP 在启动完成前关闭')))
      server.listen({ port: 0, host: '127.0.0.1', signal: controller.signal }, () => {
        server.removeListener('error', reject)
        resolve()
      })
    })
  }
  catch (error) {
    controller.abort()
    try {
      await close()
    }
    catch (cleanup) { raw.cleanup.errors.push(`历史 HTTP 启动失败后的关闭错误：${String(cleanup)}`) }
    throw error
  }
  finally {
    clearTimeout(timer)
  }
  server.on('error', error => raw.warnings.push(`历史 HTTP 错误：${String(error)}`))
  const address = server.address()
  if (!address || typeof address === 'string') {
    await close()
    throw new Error('历史夹具没有独占 HTTP 端口')
  }
  raw.origin = `http://127.0.0.1:${address.port}`
  return { close }
}
