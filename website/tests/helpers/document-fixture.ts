import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer } from 'node:http'

function deferred(released: boolean) {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  if (released) {
    resolve()
  }
  return { promise, resolve }
}

/** 使用真实 HTTP 缓存，不注册会关闭浏览器缓存的 page.route。 */
export async function createDocumentFixture(options: { holdResources?: boolean } = {}) {
  const css = deferred(!options.holdResources)
  const runtime = deferred(!options.holdResources)
  const business = deferred(false)
  const obsolete = deferred(false)
  const requests: Array<{ path: string, status: number, validator: string | undefined }> = []
  const html = `<!doctype html><html data-has-hydrated="false"><head>
    <link rel="stylesheet" href="/style.css"><script defer src="/runtime.js"></script>
    </head><body><button>Click</button><output>ready</output><div id="part">part</div></body></html>`

  async function respond(request: IncomingMessage, response: ServerResponse) {
    const pathname = new URL(request.url ?? '/', 'http://fixture.test').pathname
    const validator = request.headers['if-none-match']
    const status = pathname === '/invalid304' || (pathname === '/cached' && validator === '"ready-v1"')
      ? 304
      : pathname === '/error' ? 500 : 200
    requests.push({ path: pathname, status, validator: typeof validator === 'string' ? validator : undefined })
    if (pathname === '/failed') {
      request.socket.destroy()
      return
    }
    if (pathname === '/style.css') {
      await css.promise
      response.writeHead(200, { 'Content-Type': 'text/css' })
      response.end('button { color: rgb(12, 34, 56); }')
      return
    }
    if (pathname === '/runtime.js') {
      await runtime.promise
      response.writeHead(200, { 'Content-Type': 'application/javascript' })
      response.end(`
        document.documentElement.dataset.hasHydrated = 'true';
        addEventListener('hashchange', async () => {
          document.querySelector('output').textContent = await (await fetch('/business')).text();
        });
      `)
      return
    }
    if (pathname === '/business' || pathname === '/obsolete') {
      await (pathname === '/business' ? business : obsolete).promise
      response.end('business ready')
      return
    }
    response.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'ETag': '"ready-v1"',
      ...(pathname === '/invalid304' ? { 'X-Cache': 'HIT' } : {}),
    })
    if (status === 304) {
      response.end()
      return
    }
    if (pathname.startsWith('/redirect')) {
      const target = pathname === '/redirect-failed' ? '/failed' : pathname === '/redirect-error' ? '/error' : '/ready'
      response.end(`<script>fetch('/obsolete'); location.replace(${JSON.stringify(target)})</script>`)
      return
    }
    response.end(html)
  }

  const server = createServer((request, response) => {
    respond(request, response).catch(error => response.destroy(error))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('HTTP fixture 未获得 TCP 端口')
  }
  return {
    requests,
    url: (pathname: string) => `http://127.0.0.1:${address.port}${pathname}`,
    releaseCss: css.resolve,
    releaseRuntime: runtime.resolve,
    releaseBusiness: business.resolve,
    async dispose() {
      for (const gate of [css, runtime, business, obsolete]) {
        gate.resolve()
      }
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
        server.closeAllConnections()
      })
    },
  }
}
