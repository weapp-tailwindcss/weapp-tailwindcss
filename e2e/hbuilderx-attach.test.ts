import type { AddressInfo } from 'node:net'
import type { AttachedWebServer } from './hbuilderx-local/web/attached'
import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer as createViteServer } from 'vite'
import { afterEach, expect, it, vi } from 'vitest'
import { issue1144IdentityPlugin } from '../demo/issue-1144-uni-app-x-web/scripts/identity-plugin.mjs'
import { runWebHmr } from './hbuilderx-local/web'
import { checkAttachedIdentity, readAttachedLog, validateAttachedUrl, waitForAttachedServer } from './hbuilderx-local/web/attached'
import { assertServerIdentity } from './hbuilderx-local/web/identity'
import { createWebSession } from './hbuilderx-local/web/session'
import { rewriteHmrMarker } from './hbuilderx-local/web/source'
import { SourceTransaction } from './hbuilderx-local/web/transaction'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup()
  }
})

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'IDE 中文 & test-'))
  const root = await realpath(directory)
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'page.uvue')
  await writeFile(source, '<template>\r\n<view>anchor</view>\r\n</template>\r\n')
  const journal = path.join(root, 'artifacts', 'recovery.json')
  const server: AttachedWebServer = {
    baseUrl: 'http://127.0.0.1:1/',
    runId: 'fresh-run',
    channel: 'alpha',
    logFile: path.join(root, 'ide.log'),
    artifactRoot: path.join(root, 'artifacts'),
    writeSource: async () => {},
    assertOwned: async () => {},
  }
  return { root, source, journal, server }
}

async function listen(handler: Parameters<typeof createServer>[0]) {
  const http = createServer(handler)
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  cleanups.push(async () => {
    http.closeAllConnections()
    await new Promise<void>(resolve => http.close(() => resolve()))
  })
  return { http, url: `http://127.0.0.1:${(http.address() as AddressInfo).port}/` }
}

it.each(['http://127.0.0.1:5173/', 'http://localhost:5173/', 'http://[::1]:5173/'])('接受本机服务地址：%s', (url) => {
  expect(validateAttachedUrl(url)).toBe(url)
})
it.each(['https://example.com/', 'http://127.0.0.1:5173/page', 'http://user@localhost/', 'http://localhost/?token=x'])('拒绝错误连接地址：%s', (url) => {
  expect(() => validateAttachedUrl(url)).toThrow()
})

it.each([
  [path.posix, '/repo', '/repo/../repo', '/other'],
  [path.win32, 'C:\\repo', 'C:\\repo\\..\\repo', 'D:\\repo'],
  [path.win32, '\\\\server\\share\\repo', '\\\\server\\share\\repo', '\\\\other\\share\\repo'],
])('连接身份遵循文件系统边界：%s', (paths, root, same, other) => {
  expect(() => assertServerIdentity({ root: same }, root, paths)).not.toThrow()
  expect(() => assertServerIdentity({ root: other }, root, paths)).toThrow()
  expect(() => assertServerIdentity({ root: 'relative' }, root, paths)).toThrow()
})

it('拒绝旧标识、错误项目、重启实例与 HTTP 错误；清理不停止外部服务', async () => {
  const { root, server } = await fixture()
  let identity = { root, runId: server.runId, instanceId: 'instance-a' }
  let status = 200
  const { http, url } = await listen((_request, response) => {
    response.writeHead(status, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(identity))
  })
  server.baseUrl = url
  const session = await createWebSession(root, true, path.join(root, 'output.log'), server, '/identity')
  await session.ensureRunning()
  await session.stop()
  await session.closeProject()
  expect(http.listening).toBe(true)
  identity = { ...identity, runId: 'old' }
  await expect(session.ensureRunning()).rejects.toThrow('启动标识')
  identity = { ...identity, runId: server.runId, root: path.join(root, 'other') }
  await expect(session.ensureRunning()).rejects.toThrow('身份不匹配')
  identity = { ...identity, root }
  server.instanceId = 'other-instance'
  await expect(session.ensureRunning()).rejects.toThrow('实例已更换')
  status = 404
  await expect(session.ensureRunning()).rejects.toThrow('404')
  await new Promise<void>(resolve => http.close(() => resolve()))
  await expect(session.ensureRunning()).rejects.toThrow()
})

it('无响应服务在请求期限内失败，等待旧服务也有总期限', async () => {
  const { root, server } = await fixture()
  const { url } = await listen(() => {})
  server.baseUrl = url
  await expect(checkAttachedIdentity(server, root, '/identity', 30)).rejects.toThrow()
  const started = Date.now()
  await expect(waitForAttachedServer(server, root, '/identity', 70)).rejects.toThrow('超时')
  expect(Date.now() - started).toBeLessThan(2000)
})

it('日志必须来自本轮和正确 channel/VDOM，不能用旧输出填充证据', async () => {
  const { server } = await fixture()
  await expect(readAttachedLog(server)).rejects.toThrow()
  const log = '[wt-ide-version] fresh-run 5.25.2026082902-alpha\n编译器版本：5.25（uni-app x）VDOM模式\n[wt-acceptance] fresh-run\n'
  for (const bad of [log.replace('fresh-run', 'old-run'), log.replace('-alpha', ''), log.replace('VDOM', 'Vapor'), log.replace('编译器版本：5.25', '编译器版本：5.24'), log.replace('5.25.2026082902-alpha', 'unavailable'), log.replace('[wt-ide-version] fresh-run', '[wt-ide-version] old-run'), `${log}编译器版本：5.25（uni-app x）Vapor模式`, `${log}[wt-ide-version] fresh-run unavailable`]) {
    await writeFile(server.logFile, bad)
    await expect(readAttachedLog(server)).rejects.toThrow()
  }
  await writeFile(server.logFile, log)
  expect(await readAttachedLog(server)).toBe(log)
  const guiLog = log.replace('（uni-app x）VDOM', '(uni-app x) VDOM')
  await writeFile(server.logFile, guiLog)
  expect(await readAttachedLog(server)).toBe(guiLog)
})

it('服务启动后冻结验收标识，后来改登记文件不会冒充新服务', async () => {
  const { root } = await fixture()
  const sessionFile = path.join(root, '.hbuilderx-acceptance.json')
  await writeFile(sessionFile, JSON.stringify({ runId: 'first' }))
  let handler: any
  vi.stubEnv('HX_Version', '5.25.2026082902-alpha')
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  issue1144IdentityPlugin(root).configureServer({ middlewares: { use: (_path: string, middleware: any) => {
    handler = middleware
  } } })
  await writeFile(sessionFile, JSON.stringify({ runId: 'second' }))
  const end = vi.fn()
  handler({ url: '/' }, { setHeader: vi.fn(), end })
  expect(JSON.parse(end.mock.calls[0]![0]).runId).toBe('first')
  expect(log).toHaveBeenCalledWith('[wt-ide-version] first 5.25.2026082902-alpha')
})

it('失败后按字节恢复 CRLF，保留持久恢复记录直到恢复成功', async () => {
  const { root, source, journal } = await fixture()
  const original = await readFile(source)
  const transaction = await SourceTransaction.create(journal, root, [source])
  await rewriteHmrMarker(source, ['<view>anchor'], [{ markerClass: 'w-1', markerText: 'save-1', cssContains: [] }], 0, undefined, (file, content) => transaction.write(file, content))
  expect(await readFile(source, 'utf8')).toContain('save-1')
  await (await SourceTransaction.recover(journal, root)).restore()
  expect(await readFile(source)).toEqual(original)
  await expect(readFile(journal)).rejects.toThrow()
})

it('外部修改后拒绝下一次写入和恢复，不覆盖用户内容', async () => {
  const { root, source, journal } = await fixture()
  const transaction = await SourceTransaction.create(journal, root, [source])
  await transaction.write(source, 'own-change')
  await writeFile(source, 'user-change')
  await expect(transaction.write(source, 'next')).rejects.toThrow('外部修改')
  await expect(transaction.restore()).rejects.toThrow('外部修改')
  expect(await readFile(source, 'utf8')).toBe('user-change')
  expect(JSON.parse(await readFile(journal, 'utf8')).entries).toHaveLength(1)
})

it('写入前落盘的下一版本可恢复，拒绝跨项目和非法账本', async () => {
  const { root, source, journal } = await fixture()
  const transaction = await SourceTransaction.create(journal, root, [source])
  await transaction.expectGenerated(source, 'generated')
  await writeFile(source, 'generated')
  await transaction.restore()
  const sibling = await mkdtemp(path.join(tmpdir(), 'outside-'))
  cleanups.push(() => rm(sibling, { recursive: true, force: true }))
  const other = path.join(sibling, 'source')
  await writeFile(other, 'outside')
  await expect(SourceTransaction.create(journal, root, [other])).rejects.toThrow('超出项目')
  await mkdir(path.dirname(journal), { recursive: true })
  await writeFile(journal, JSON.stringify({ root, entries: [{ file: other, original: Buffer.from('x').toString('base64'), allowed: [] }] }))
  await expect(SourceTransaction.recover(journal, root)).rejects.toThrow('无效文件')
})

it('真实 Vite 与浏览器执行连接模式，保存和刷新后校验样式且保留外部服务', async () => {
  const { root, server, journal } = await fixture()
  vi.stubEnv('HX_Version', '5.25.2026082902-alpha')
  const html = path.join(root, 'index.html')
  const original = '<!DOCTYPE html><html><head><link rel="icon" href="data:,"></head><body><view class="hbuilderx-web-hmr-probe">initial</view><style>view { display: block; width: 10px; }</style></body></html>'
  await writeFile(html, original)
  await writeFile(path.join(root, 'style.css'), 'view { display: block; }')
  await writeFile(path.join(root, '.hbuilderx-acceptance.json'), JSON.stringify({ runId: server.runId }))
  const logs: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((value) => {
    logs.push(String(value))
  })
  const vite = await createViteServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 }, plugins: [issue1144IdentityPlugin(root)] })
  cleanups.push(() => vite.close())
  await vite.listen()
  server.baseUrl = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}/`
  const transaction = await SourceTransaction.create(journal, root, [html])
  server.assertOwned = () => transaction.assertOwned()
  server.writeSource = (file, content) => transaction.write(file, content)
  server.instanceId = (await checkAttachedIdentity(server, root, '/__issue1144_identity')).instanceId
  // 这里只验证验收器；合成日志不能作为真实 HBuilderX 验收证据。
  const prefix = '编译器版本：5.25（uni-app x）VDOM模式\n'
  let pending = Promise.resolve()
  spy.mockImplementation((value) => {
    logs.push(String(value))
    pending = pending.then(() => writeFile(server.logFile, prefix + logs.join('\n')))
  })
  const result = await runWebHmr(root, html, [], '/style.css?direct', '/style.css?direct', ['display: block'], [{ selector: 'view', styles: { width: '10px' } }], [], [{
    markerClass: 'probe',
    markerText: 'updated',
    cssContains: ['display: block'],
    runtimeStyles: [{ selector: 'view', styles: { width: '20px' } }],
    reload: true,
    sourceMutation: { file: 'index.html', replace: { from: 'width: 10px', to: 'width: 20px' } },
  }], true, ['initial'], '/__issue1144_identity', server)
  await pending
  expect(result.pageErrors).toEqual([])
  expect(result.hmrCss).toHaveLength(1)
  expect(vite.httpServer!.listening).toBe(true)
  expect(JSON.parse(await readFile(path.join(server.artifactRoot, 'save-1.json'), 'utf8')).styles[0].width).toBe('20px')
  await transaction.restore()
  expect(await readFile(html, 'utf8')).toBe(original)
}, 30_000)
