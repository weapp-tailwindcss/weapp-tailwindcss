import assert from 'node:assert/strict'
import { stripVTControlCharacters } from 'node:util'
import { until } from './process.mjs'

export function announcedViteUrl(log, route = '/') {
  // 日志按流分块，未换行的尾部可能只有半个端口，不能提前消费。
  const completeLines = stripVTControlCharacters(log).split(/\r?\n/).slice(0, -1)
  const announcement = completeLines.map(line => /(?:^|\s)Local:\s+(\S+)\s*$/.exec(line)).find(Boolean)
  assert.ok(announcement, 'Vite has not announced its listening address')
  const base = new URL(announcement[1])
  assert.ok(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), `Unexpected development endpoint: ${base.href}`)
  assert.ok(!base.username && !base.password, 'Development endpoint cannot contain credentials')
  const url = new URL(route, base)
  assert.equal(url.origin, base.origin, 'Development route must stay on the owned server')
  return url.href
}

export async function developmentUrl(item, port, session, timeout) {
  if (item.family === 'taro' && item.bundler === 'vite' && item.target === 'h5') {
    return until(() => announcedViteUrl(session.log(), item.route), session, timeout)
  }
  return new URL(item.route ?? '/', `http://127.0.0.1:${port}`).href
}
