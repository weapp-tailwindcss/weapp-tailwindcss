import type { PreflightSession } from './session'
import type { Identity, ProbeId } from './types'
import { createServer } from 'node:http'
import { challengePage, recordComputerUseBlock } from './computer-use'
import { requiredCheckIds } from './types'

export async function serve(session: PreflightSession) {
  const report = session.report
  let onFinish = () => {}
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', report.endpoint || 'http://127.0.0.1')
      if (req.headers.host !== new URL(report.endpoint).host || (req.headers.origin && req.headers.origin !== report.endpoint)) {
        throw new Error('只允许本轮 loopback 服务访问。')
      }
      res.setHeader('cache-control', 'no-store')
      if (req.method === 'GET' && url.pathname === `/challenge/${report.challenge}`) {
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.end(challengePage(report.runId, `/interaction/${report.challenge}`, url.searchParams.get('probe') === 'web'))
        return
      }
      if (req.method !== 'POST') {
        throw new Error('未知预检操作。')
      }
      let body = ''
      for await (const chunk of req) {
        body += chunk.toString()
        if (body.length > 128_000) {
          throw new Error('预检请求超过限制。')
        }
      }
      const payload = JSON.parse(body)
      if (url.pathname === `/interaction/${report.challenge}`) {
        if (payload.runId !== report.runId || payload.typed !== true || payload.clicked !== true) {
          throw new Error('缺少本轮页面交互。')
        }
        session.interactionAt = new Date().toISOString()
        res.end('{}')
        return
      }
      if (req.headers.authorization !== `Bearer ${report.token}`) {
        throw new Error('预检会话凭据不匹配。')
      }
      let result: unknown
      if (url.pathname === '/verify') {
        result = await session.verify(payload.identity as Identity)
      }
      else if (url.pathname === '/claim') {
        result = await session.claim(payload.identity as Identity, String(payload.consumer), payload.extended === true)
      }
      else if (url.pathname === '/check') {
        if (!Array.isArray(payload.ids) || payload.ids.some((id: string) => id === 'computer-use' || !requiredCheckIds(report.extended).includes(id as ProbeId))) {
          throw new Error('存活检查目标无效。')
        }
        await session.check(payload.identity as Identity, payload.lease, payload.ids)
        result = { status: 'running' }
      }
      else if (url.pathname === '/finish') {
        await session.finish(payload.lease)
        result = { status: report.status }
        res.once('finish', () => onFinish())
      }
      else if (url.pathname === '/block') {
        await session.cancel()
        await recordComputerUseBlock(report, session.file, String(payload.reason ?? ''))
        result = { status: 'blocked' }
        res.once('finish', () => onFinish())
      }
      else {
        throw new Error('未知预检操作。')
      }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(result))
    }
    catch (error) {
      res.statusCode = 409
      res.end(JSON.stringify({ error: String(error) }))
    }
  })
  server.requestTimeout = 10_000
  server.headersTimeout = 5000
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('未能建立 loopback 预检服务。')
  }
  report.endpoint = `http://127.0.0.1:${address.port}`
  return {
    onFinish(callback: () => void) { onFinish = callback },
    close: () => new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    }),
  }
}
