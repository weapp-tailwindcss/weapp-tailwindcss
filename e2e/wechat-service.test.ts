import type { RequestListener } from 'node:http'
import { createServer } from 'node:http'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertWechatLogin, ownedWechatPort, serviceDirectory, servicePort, wechatRequest } from '../scripts/wechat/service'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(cleanup.splice(0).map(close => close()))
})

async function server(handler: RequestListener) {
  const instance = createServer(handler)
  await new Promise<void>(resolve => instance.listen(0, '127.0.0.1', resolve))
  cleanup.push(() => new Promise<void>((resolve, reject) => instance.close(error => error ? reject(error) : resolve())))
  const address = instance.address()
  if (!address || typeof address === 'string') {
    throw new Error('无端口')
  }
  return address.port
}

describe('微信已有服务边界', () => {
  it.each(['0', '65536', '1.5', 'abc', '-1', ' 123'])('拒绝无效端口 %s', (port) => {
    expect(() => servicePort(port)).toThrow('端口')
  })

  it('按安装身份定位端口，支持 macOS 与 Windows 路径', () => {
    expect(serviceDirectory('/Applications/wechatwebdevtools.app/Contents/Resources/app.asar.unpacked/package.json', '微信开发者工具', '/Users/test', 'darwin'))
      .toBe('/Users/test/Library/Application Support/微信开发者工具/d1e8765721a6c23d43b14c95b1843e6b/Default')
    const windows = serviceDirectory('C:\\Program Files\\微信\\resources\\app.asar.unpacked\\package.json', '微信开发者工具', 'D:\\用户', 'win32')
    expect(windows).toMatch(/^D:\\用户\\AppData\\Local\\微信开发者工具\\User Data\\[a-f\d]{32}\\Default$/)
    expect(() => serviceDirectory('/x/package.nw/package.json', '微信', '/home/test', 'linux')).toThrow('显式设置')
    expect(() => serviceDirectory('/x/app.asar.unpacked/package.json', '..', '/Users/test', 'darwin')).toThrow('显式设置')
  })

  it.each(['/owned/中文 + # %20 % project', 'C:\\owned\\中文 %20 # +', '/', './relative %20'])('按 IDE 双重解码协议保留路径：%s', async (project) => {
    const requests: URL[] = []
    const port = await server((req, res) => {
      requests.push(new URL(req.url!, 'http://127.0.0.1'))
      res.end(JSON.stringify({ autoPort: 45678 }))
    })
    await wechatRequest(port, { kind: 'auto', project, port: 45678 })
    expect(decodeURIComponent(requests[0]!.searchParams.get('project')!)).toBe(path.resolve(project))
    expect([...requests[0]!.searchParams.keys()]).toEqual(['project', 'port', 'autoPort'])
    await wechatRequest(port, { kind: 'close', project })
  })

  it('兼容稳定版以窗口 ID 返回的 auto，并把本轮端口规范化回执给连接层', async () => {
    const requests: URL[] = []
    const port = await server((req, res) => {
      const request = new URL(req.url!, 'http://127.0.0.1')
      requests.push(request)
      res.end(request.pathname === '/v2/auto' ? JSON.stringify('s123') : JSON.stringify({ success: true, winId: 's123' }))
    })
    const project = `/stable-window-${port}`
    await expect(wechatRequest(port, { kind: 'auto', project, port: 45679 })).resolves.toEqual({ autoPort: 45679, windowId: 's123' })
    expect(requests[0]!.searchParams.get('port')).toBe('45679')
    expect(requests[0]!.searchParams.get('autoPort')).toBe('45679')
    await wechatRequest(port, { kind: 'close', project })
  })

  it('同一 HTTP 服务拒绝第二个项目并发打开，关闭后才释放租约', async () => {
    const requests: URL[] = []
    const port = await server((req, res) => {
      const request = new URL(req.url!, 'http://127.0.0.1')
      requests.push(request)
      res.end(request.pathname === '/v2/auto' ? JSON.stringify('s456') : JSON.stringify({ success: true, winId: 's456' }))
    })
    const first = `/lease-first-${port}`
    const second = `/lease-second-${port}`
    await wechatRequest(port, { kind: 'auto', project: first, port: 45680 })
    await expect(wechatRequest(port, { kind: 'auto', project: second, port: 45681 })).rejects.toThrow('运行时资源按 HTTP 服务共享')
    expect(requests).toHaveLength(1)
    await wechatRequest(port, { kind: 'close', project: first })
    await wechatRequest(port, { kind: 'auto', project: second, port: 45681 })
    expect(requests).toHaveLength(3)
    await wechatRequest(port, { kind: 'close', project: second })
  })

  it('同一项目的并发 auto 在登记前即拒绝，不覆盖原服务归属', async () => {
    const port = await server(async (req, res) => {
      await new Promise(resolve => setTimeout(resolve, 20))
      const request = new URL(req.url!, 'http://127.0.0.1')
      res.end(request.pathname === '/v2/auto' ? JSON.stringify('s789') : JSON.stringify({ success: true, winId: 's789' }))
    })
    const project = `/same-project-${port}`
    const first = wechatRequest(port, { kind: 'auto', project, port: 45682 })
    await expect(wechatRequest(port, { kind: 'auto', project, port: 45683 })).rejects.toThrow('已有请求正在执行')
    await first
    expect(ownedWechatPort(project)).toBe(String(port))
    await wechatRequest(port, { kind: 'close', project })
  })

  it.each([false, undefined, 'true'])('非明确登录态 %s 阻断之后所有项目请求', async (login) => {
    let calls = 0
    const port = await server((_req, res) => {
      calls++
      res.end(JSON.stringify({ login }))
    })
    await expect(assertWechatLogin(port)).rejects.toThrow('登录未确认')
    await expect(wechatRequest(port, { kind: 'auto', project: `/owned-${port}`, port: 45678 })).rejects.toThrow('停止后续')
    await expect(wechatRequest(port, { kind: 'close', project: `/owned-${port}` })).rejects.toThrow('停止后续')
    expect(calls).toBe(1)
  })

  it.each([200, 401, 500])('HTTP %s 认证/业务失败立即阻断，不继续清理或刷新票据', async (status) => {
    let calls = 0
    const port = await server((_req, res) => {
      calls++
      res.statusCode = status
      res.end(JSON.stringify({ code: 'APPID_ERROR', message: '需要重新登录 sensitive-ticket' }))
    })
    await expect(wechatRequest(port, { kind: 'auto', project: `/owned-${port}`, port: 45678 })).rejects.toThrow(`HTTP ${status}`)
    await expect(wechatRequest(port, { kind: 'close', project: `/owned-${port}` })).rejects.toThrow('停止后续')
    expect(calls).toBe(1)
  })

  it('只向同源异步任务接口转发认证', async () => {
    const paths: string[] = []
    vi.stubEnv('WECHAT_DEVTOOLS_CLI_TOKEN', 'test-token')
    const port = await server((req, res) => {
      paths.push(req.url!)
      expect(req.headers.authorization).toBe('Bearer test-token')
      if (paths.length === 1) {
        res.writeHead(303, { location: '/v2/taskresult/owned?t=1' }).end()
      }
      else {
        res.end('{"login":true}')
      }
    })
    await expect(assertWechatLogin(port)).resolves.toBeUndefined()
    expect(paths).toEqual(['/v2/isLogin', '/v2/taskresult/owned?t=1'])
  })

  it.each(['http://example.com/v2/taskresult/a', '/v2/logout', 'http://['])('拒绝跳转到 %s', async (location) => {
    let calls = 0
    const port = await server((_req, res) => {
      calls++
      res.writeHead(303, { location }).end()
    })
    await expect(assertWechatLogin(port)).rejects.toThrow('重定向')
    await expect(wechatRequest(port, { kind: 'close', project: `/owned-${port}` })).rejects.toThrow('停止后续')
    expect(calls).toBe(1)
  })

  it('项目打开后绑定原服务，拒绝迁移到不同 IDE 再清理', async () => {
    const first = await server((_req, res) => res.end('{"autoPort":45678}'))
    let otherCalls = 0
    const second = await server((_req, res) => {
      otherCalls++
      res.end('{"autoPort":45678}')
    })
    const project = `/bound-${first}`
    await wechatRequest(first, { kind: 'auto', project, port: 45678 })
    expect(ownedWechatPort(project)).toBe(String(first))
    await expect(wechatRequest(second, { kind: 'auto', project, port: 45678 })).rejects.toThrow('绑定已改变')
    expect(otherCalls).toBe(0)
    await wechatRequest(first, { kind: 'close', project })
    expect(() => ownedWechatPort(project)).toThrow('未登记')
  })

  it('响应正文超时不会继续清理或隐式启动', async () => {
    let calls = 0
    const port = await server((_req, res) => {
      calls++
      res.writeHead(200)
      res.flushHeaders()
    })
    await expect(assertWechatLogin(port, 50)).rejects.toThrow('失败')
    await expect(wechatRequest(port, { kind: 'close', project: `/owned-${port}` })).rejects.toThrow('停止后续')
    expect(calls).toBe(1)
  })
})
