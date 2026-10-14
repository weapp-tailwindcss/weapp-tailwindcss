import type { LocalWorkerOptions } from './server'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

export const fixtureHtml = '<!doctype html><html><body>本轮网站构建</body></html>'

/** 使用真实合成进程验证归属与退出；不启动 Wrangler、浏览器或设备。 */
export async function workerFixture(mode = 'ready') {
  const root = await mkdtemp(path.join(tmpdir(), 'website worker 中文 & '))
  await mkdir(path.join(root, 'build', 'assets', 'css'), { recursive: true })
  await writeFile(path.join(root, 'build', 'index.html'), fixtureHtml)
  await writeFile(path.join(root, 'build', 'assets', 'css', 'fixture.css'), 'body{}')
  const descendantScript = path.join(root, 'descendant fixture.cjs')
  await writeFile(descendantScript, `
    const http = require('node:http')
    const fs = require('node:fs')
    const path = require('node:path')
    const server = http.createServer((req, res) => {
      res.end('owned descendant')
      if (req.url === '/stop') stop()
    })
    function stop() { server.closeAllConnections(); server.close(() => process.exit(0)) }
    server.listen(0, '127.0.0.1', () => {
      fs.writeFileSync(path.join(process.cwd(), process.argv[2]), JSON.stringify({ pid: process.pid, port: server.address().port }))
      if (process.send) { process.send('ready'); process.disconnect() }
    })
    process.on('SIGTERM', stop)
    setTimeout(stop, 10000).unref()
  `)
  const spawnDescendant = (name: string, detached = false) => `require('node:child_process').spawn(process.execPath, [${JSON.stringify(descendantScript)}, ${JSON.stringify(name)}], { cwd: process.cwd(), detached: ${detached}, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })`
  const script = path.join(root, 'worker fixture.cjs')
  await writeFile(script, `
    const http = require('node:http')
    const fs = require('node:fs')
    const path = require('node:path')
    const port = Number(process.argv[2])
    const mode = process.argv[3]
    fs.writeFileSync(path.join(process.cwd(), 'worker.pid'), String(process.pid))
    if (mode === 'exit-zero') process.exit(0)
    if (mode === 'surviving-descendant') ${spawnDescendant('worker-descendant.json')}
    if (mode === 'surviving-detached') ${spawnDescendant('worker-descendant.json', true)}
    const server = http.createServer((req, res) => {
      if (req.url === '/hang-head') return
      if (req.url === '/hang-body') { res.writeHead(200); res.write('partial'); return }
      if (req.url === '/exit') { res.end('exit'); setTimeout(() => process.exit(0), 20); return }
      if (req.url === '/en/docs/intro') { res.writeHead(301, { Location: '/docs/intro' }); res.end(); return }
      if (req.url === '/docs/migrations/v2') { res.writeHead(301, { Location: '/docs/migrations/v5' }); res.end(); return }
      if (req.url.includes('unknown-worker-route')) { res.writeHead(404); res.end('missing'); return }
      if (req.url === '/assets/css/fixture.css') { res.writeHead(200, { 'cache-control': 'public, max-age=31536000, immutable' }); res.end('body{}'); return }
      res.end(mode === 'stale' ? '旧实例' : ${JSON.stringify(fixtureHtml)})
    })
    server.listen(port, '127.0.0.1', () => {
      if (mode !== 'silent') console.log('Ready on http://127.0.0.1:' + (mode === 'wrong-url' ? port + 1 : port))
    })
    process.on('SIGTERM', () => { server.closeAllConnections(); server.close(() => process.exit(0)) })
  `)
  const options: LocalWorkerOptions = {
    websiteRoot: root,
    readyTimeoutMs: 2000,
    requestTimeoutMs: 80,
    createCommand: async (_, port) => ({ command: process.execPath, args: [script, String(port), mode], cwd: root }),
  }
  return {
    root,
    options,
    async workerPid() { return Number(await readFile(path.join(root, 'worker.pid'), 'utf8')) },
    browserCommand: {
      command: process.execPath,
      args: ['-e', 'require("node:fs").writeFileSync("browser.pid", String(process.pid)); setInterval(() => {}, 1000)'],
      cwd: root,
    },
    async browserPid() { return Number(await readFile(path.join(root, 'browser.pid'), 'utf8')) },
    survivingBrowserCommand: {
      command: process.execPath,
      args: ['-e', `const child = ${spawnDescendant('browser-descendant.json')}; child.once('message', () => process.exit(0))`],
      cwd: root,
      stdio: 'inherit' as const,
    },
    async descendant(name: 'worker' | 'browser') {
      return JSON.parse(await readFile(path.join(root, `${name}-descendant.json`), 'utf8')) as { pid: number, port: number }
    },
    async stopDescendants() {
      for (const name of ['worker', 'browser']) {
        let owned: { pid: number, port: number }
        try {
          owned = JSON.parse(await readFile(path.join(root, `${name}-descendant.json`), 'utf8'))
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            continue
          }
          throw error
        }
        try {
          process.kill(owned.pid, 0)
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
            continue
          }
          throw error
        }
        // 回归失败时通过本轮专属端口协作退出，不按历史 PID 终止进程。
        await fetch(`http://127.0.0.1:${owned.port}/stop`, { signal: AbortSignal.timeout(2000) })
        const deadline = Date.now() + 2000
        while (true) {
          try {
            process.kill(owned.pid, 0)
          }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
              break
            }
            throw error
          }
          if (Date.now() >= deadline) {
            throw new Error(`合成后代 pid=${owned.pid} 的协作收尾未确认。`)
          }
          await delay(10)
        }
      }
    },
  }
}
