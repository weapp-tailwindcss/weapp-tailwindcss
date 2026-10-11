import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { cases } from './catalog.mjs'
import { announcedViteUrl, developmentUrl } from './endpoint.mjs'
import { startProcess } from './process.mjs'

const item = cases.find(item => item.id === 'style-injector-taro-vite-react:h5')

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

it('follows the actual Taro Vite endpoint when another server occupies the requested port', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'demo-matrix-port-'))
  const occupant = createServer((_req, res) => res.end('wrong-server'))
  let session
  try {
    await new Promise((resolve, reject) => {
      occupant.once('error', reject)
      occupant.listen(0, '0.0.0.0', resolve)
    })
    const port = occupant.address().port
    const require = createRequire(import.meta.url)
    const vite = pathToFileURL(path.join(path.dirname(require.resolve('vite4/package.json')), 'dist/node/index.js')).href
    const fixture = path.join(root, 'server.mjs')
    await writeFile(path.join(root, 'index.html'), 'owned-development-server')
    await writeFile(fixture, `
      import { createServer } from ${JSON.stringify(vite)}
      const server = await createServer({
        root: ${JSON.stringify(root)}, configFile: false,
        server: { host: '0.0.0.0', port: ${port}, strictPort: false },
      })
      await server.listen()
      server.printUrls()
    `)
    session = startProcess(process.execPath, [fixture], root, {})
    const url = await developmentUrl(item, port, session, 15_000)
    expect(new URL(url).port).not.toBe(String(port))
    expect(new URL(url).hash).toBe('#/sub-normal/pages/index/index')
    expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe('wrong-server')
    expect(await (await fetch(url)).text()).toContain('owned-development-server')
  }
  finally {
    await session?.stop()
    await new Promise((resolve, reject) => occupant.close(error => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 25_000)
