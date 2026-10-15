import type { Server, ServerResponse } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'

export const videoDocuments = [
  { file: 'docs/quick-start/frameworks/taro.md', route: '/zh-cn/docs/quick-start/frameworks/taro', aid: '966499437', bvid: 'BV1UW4y1w7VM', cid: '1411385502', title: 'Taro 视频演示', summary: '加载视频演示', link: '在哔哩哔哩观看' },
  { file: 'docs/quick-start/frameworks/uni-app-vite.md', route: '/zh-cn/docs/quick-start/frameworks/uni-app-vite', aid: '326378691', bvid: 'BV14w411773C', cid: '1409199088', title: 'uni-app Vite 视频演示', summary: '加载视频演示', link: '在哔哩哔哩观看' },
  { file: 'i18n/en/docusaurus-plugin-content-docs/current/quick-start/frameworks/taro.md', route: '/docs/quick-start/frameworks/taro', aid: '966499437', bvid: 'BV1UW4y1w7VM', cid: '1411385502', title: 'Taro video demonstration', summary: 'Load video demonstration', link: 'Watch on Bilibili' },
  { file: 'i18n/en/docusaurus-plugin-content-docs/current/quick-start/frameworks/uni-app-vite.md', route: '/docs/quick-start/frameworks/uni-app-vite', aid: '326378691', bvid: 'BV14w411773C', cid: '1409199088', title: 'uni-app Vite video demonstration', summary: 'Load video demonstration', link: 'Watch on Bilibili' },
]

async function listen(server: Server, sockets: Set<Socket>, serverErrors: Error[]) {
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      server.on('error', error => serverErrors.push(error))
      resolve()
    })
  })
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

async function createVideoFixture(file: string, testDir: string) {
  const markdown = await readFile(path.resolve(testDir, '..', file), 'utf8')
  const section = markdown.slice(markdown.lastIndexOf('\n## ')).split('\n').slice(2).join('\n')
  const originalSrc = section.match(/<iframe\b[^>]+\bsrc="([^"]+)"/)?.[1]
  if (!originalSrc) {
    throw new Error(`视频文档缺少播放器：${file}`)
  }
  const sockets = new Set<Socket>()
  const streams = new Set<ServerResponse>()
  const serverErrors: Error[] = []
  const requests: string[] = []
  const player = createServer((request, response) => {
    const url = new URL(request.url!, 'http://fixture.test')
    requests.push(url.pathname)
    if (url.pathname === '/stream.mp4') {
      // 模拟播放器通过 fetch 持续接收的部分视频响应，显式保留未完成的 206 body。
      streams.add(response)
      response.once('close', () => streams.delete(response))
      response.writeHead(206, {
        'content-type': 'video/mp4',
        'content-length': '65536',
        'content-range': 'bytes 0-65535/65536',
        'accept-ranges': 'bytes',
      })
      response.write(Buffer.alloc(512))
    }
    else {
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end(`<!doctype html><html><body>
        <p>Video player ready</p>
        <button onclick="document.querySelector('output').textContent='playing'">Play demonstration</button>
        <output>paused</output>
        <script>fetch('/stream.mp4')</script>
      </body></html>`)
    }
  })
  let main: Server | undefined
  async function dispose() {
    // server.close 的回调可能早于 socket/response 的 close 事件，须分别等待资源真正关闭。
    const closed = [...sockets, ...streams].map(resource => new Promise<void>((resolve) => {
      resource.once('close', resolve)
    }))
    for (const socket of sockets) {
      socket.destroy()
    }
    const closing = [main, player].filter((server): server is Server => server?.listening === true).map(server => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    }))
    const results = await Promise.allSettled([...closed, ...closing])
    const errors = [...serverErrors, ...results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])]
    if (errors.length) {
      throw new AggregateError(errors, '视频测试 HTTP 服务清理失败')
    }
  }
  try {
    const playerOrigin = await listen(player, sockets, serverErrors)
    const playerUrl = new URL(originalSrc, 'https://website.test')
    const fixtureSrc = new URL(`${playerUrl.pathname}${playerUrl.search}`, playerOrigin).href
    const html = `<!doctype html><html data-has-hydrated="true"><body>
      <main><h1>Documentation</h1><div style="height:2500px">Guide content</div>
        ${section.replace(originalSrc, fixtureSrc)}
      </main></body></html>`
    main = createServer((_request, response) => {
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end(html)
    })
    const url = await listen(main, sockets, serverErrors)
    return { url, playerOrigin, fixtureSrc, originalSrc, html, requests, streams, sockets, dispose }
  }
  catch (error) {
    await dispose().catch((cleanupError) => {
      throw new AggregateError([error, cleanupError], '视频测试服务启动与清理均失败')
    })
    throw error
  }
}

export async function withVideoFixture(file: string, testDir: string, run: (fixture: Awaited<ReturnType<typeof createVideoFixture>>) => Promise<void>) {
  const fixture = await createVideoFixture(file, testDir)
  let failure: unknown
  try {
    await run(fixture)
  }
  catch (error) {
    failure = error
  }
  try {
    await fixture.dispose()
  }
  catch (error) {
    failure = failure ? new AggregateError([failure, error], '视频测试与资源清理均失败') : error
  }
  if (failure) {
    throw failure
  }
  if (fixture.sockets.size || fixture.streams.size) {
    throw new Error('视频测试 HTTP socket 或视频流未完全关闭')
  }
}
