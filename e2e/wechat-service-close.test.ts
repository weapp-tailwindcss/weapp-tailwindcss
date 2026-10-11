import type { ServerResponse } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { ownedWechatEndpoint, wechatRequest, wechatServiceLockPath } from '../scripts/wechat/service'

it.for(['同路径', '不同路径'])('同一租约只发送一次 close，旧清理不能影响%s的新会话', async (target, context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wechat-close-generation-'))
  vi.stubEnv('E2E_WECHAT_LOCK_DIRECTORY', directory)
  const firstClose = Promise.withResolvers<ServerResponse>()
  const requests: string[] = []
  const pending: Promise<unknown>[] = []
  const observe = <T>(promise: Promise<T>) => {
    pending.push(promise)
    void promise.catch(() => {})
    return promise
  }
  let response: ServerResponse | undefined
  const server = createServer((req, res) => {
    const request = new URL(req.url!, 'http://127.0.0.1')
    requests.push(request.pathname)
    if (request.pathname === '/v2/close' && requests.filter(value => value === '/v2/close').length === 1) {
      response = res
      firstClose.resolve(res)
      return
    }
    res.end(request.pathname === '/v2/auto' ? JSON.stringify('s123') : JSON.stringify({ success: true }))
  })
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('测试服务未监听端口')
    }
    const port = address.port
    const project = path.join(directory, 'project')
    await wechatRequest(port, { kind: 'auto', project, port: 45678 })
    const closing = observe(wechatRequest(port, { kind: 'close', project }))
    const aborted = Promise.withResolvers<never>()
    const onAbort = () => aborted.reject(context.signal.reason)
    context.signal.addEventListener('abort', onAbort, { once: true })
    if (context.signal.aborted) {
      onAbort()
    }
    try {
      response = await Promise.race([
        firstClose.promise,
        closing.then(() => { throw new Error('关闭请求未触达测试屏障') }),
        aborted.promise,
      ])
    }
    finally {
      context.signal.removeEventListener('abort', onAbort)
    }
    expect(() => ownedWechatEndpoint(project)).toThrow('拒绝借用')
    const duplicate = observe(wechatRequest(port, { kind: 'close', project })).then(
      () => ({ error: undefined }),
      (error: unknown) => ({ error }),
    )
    response.end(JSON.stringify({ success: true }))
    await closing
    const result = await duplicate
    expect(result.error).toBeInstanceOf(Error)
    expect(String(result.error)).toContain('正在关闭')
    expect(requests).toEqual(['/v2/auto', '/v2/close'])

    const nextProject = target === '同路径' ? project : path.join(directory, 'next-project')
    await wechatRequest(port, { kind: 'auto', project: nextProject, port: 45679 })
    expect(ownedWechatEndpoint(nextProject)).toBe('ws://127.0.0.1:45679')
    await wechatRequest(port, { kind: 'close', project: nextProject })
    await expect(readFile(wechatServiceLockPath(port))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(() => ownedWechatEndpoint(project)).toThrow('拒绝借用')
    expect(requests).toEqual(['/v2/auto', '/v2/close', '/v2/auto', '/v2/close'])
  }
  finally {
    if (response && !response.writableEnded) {
      response.end(JSON.stringify({ success: true }))
    }
    await Promise.allSettled(pending)
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    vi.unstubAllEnvs()
    await rm(directory, { recursive: true, force: true })
  }
})
