import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { cases } from './catalog.mjs'
import { announcedViteUrl, developmentUrl } from './endpoint.mjs'
import { reserveOccupiedPort } from './port.fixture.mjs'
import { startProcess } from './process.mjs'

const item = cases.find(item => item.id === 'style-injector-taro-vite-react:h5')

async function closeFixture(root, session, occupant) {
  const results = await Promise.allSettled([
    session?.stop(),
    occupant?.close(),
  ])
  results.push(...await Promise.allSettled([rm(root, { recursive: true, force: true })]))
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
  if (errors.length) {
    throw new AggregateError(errors, '开发端口回归资源清理失败')
  }
}

it.each(['localhost', '127.0.0.1', '[::1]'])('preserves the announced host and hash route (%s)', (host) => {
  expect(announcedViteUrl(`\u001B[32m  ➜  Local:   http://${host}:49230/\u001B[0m\r\n`, item.route))
    .toBe(`http://${host}:49230${item.route}`)
})

it('waits for a complete Local line rather than a partial port or Network address', () => {
  expect(() => announcedViteUrl('Network: http://192.168.1.2:49230/\nLocal: http://localhost:492'))
    .toThrow('has not announced')
  expect(announcedViteUrl('Local: http://localhost:49230/\n')).toBe('http://localhost:49230/')
})

it.each(['https://example.com/', 'http://localhost.example.com:49230/', 'http://user@localhost:49230/', 'file:///tmp/server'])('rejects an untrusted announcement (%s)', (url) => {
  expect(() => announcedViteUrl(`Local: ${url}\n`)).toThrow()
})

it('rejects a route that changes the server origin', () => {
  expect(() => announcedViteUrl('Local: http://localhost:49230/\n', '//example.com/')).toThrow('owned server')
})

it('bounds missing announcements and rejects an exited session without using the requested port', async () => {
  await expect(developmentUrl(item, 49227, { log: () => '', ensureRunning() {} }, 10)).rejects.toThrow('has not announced')
  await expect(developmentUrl(item, 49227, {
    log: () => '',
    ensureRunning() { throw new Error('child exited') },
  })).rejects.toThrow('child exited')
  expect(await developmentUrl({ family: 'vite', target: 'web' }, 49227)).toBe('http://127.0.0.1:49227/')
})

it.each(['EADDRINUSE', 'EACCES'])('后继端口 %s 不影响实际分配端口的服务公告和正文身份', async (code) => {
  const root = await mkdtemp(path.join(tmpdir(), 'demo-matrix-port-'))
  let occupant
  let session
  try {
    occupant = await reserveOccupiedPort()
    const port = occupant.port
    const require = createRequire(import.meta.url)
    const vite = pathToFileURL(path.join(path.dirname(require.resolve('vite4/package.json')), 'dist/node/index.js')).href
    const fixture = path.join(root, 'server.mjs')
    await writeFile(path.join(root, 'index.html'), 'owned-development-server')
    await writeFile(fixture, `
      import { Server } from 'node:net'
      import { createServer } from ${JSON.stringify(vite)}
      const listen = Server.prototype.listen
      Server.prototype.listen = function(...args) {
        const port = typeof args[0] === 'object' ? args[0]?.port : args[0]
        if (port === ${port + 1}) {
          queueMicrotask(() => this.emit('error', Object.assign(new Error('fixture successor denied'), {code: ${JSON.stringify(code)}})))
          return this
        }
        return Reflect.apply(listen, this, args)
      }
      const server = await createServer({
        root: ${JSON.stringify(root)}, configFile: false,
        server: { host: '127.0.0.1', port: 0, strictPort: false },
      })
      await server.listen()
      server.printUrls()
    `)
    session = startProcess(process.execPath, [fixture], root, {})
    const url = await developmentUrl(item, port, session, 15_000)
    expect(new URL(url).hostname).toBe('127.0.0.1')
    expect(new URL(url).port).not.toBe(String(port))
    expect(new URL(url).hash).toBe('#/sub-normal/pages/index/index')
    expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe('wrong-server')
    expect(await (await fetch(url)).text(), `${url}\n${session.log()}`).toContain('owned-development-server')
  }
  finally {
    await closeFixture(root, session, occupant)
  }
}, 25_000)

it('端口回退日志仍只消费完整 Local 公告，不从请求端口推算', () => {
  const log = 'Port 49227 is in use, trying another one...\nNetwork: http://192.168.1.2:49228/\nLocal: http://127.0.0.1:49230/\n'
  expect(announcedViteUrl(log, item.route)).toBe(`http://127.0.0.1:49230${item.route}`)
})

it('无 Local 公告的 EACCES 退出仍失败，不把原请求端口当作服务', async () => {
  const error = new Error('listen EACCES 127.0.0.1:49228')
  await expect(developmentUrl(item, 49227, {
    log: () => 'Port 49227 is in use, trying another one...\n',
    ensureRunning() { throw error },
  }, 10)).rejects.toBe(error)
})
