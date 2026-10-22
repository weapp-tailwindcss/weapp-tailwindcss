import type { IncomingMessage, ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, expect, vi } from 'vitest'

const require = createRequire(import.meta.url)
export const { createMetroHttpArchive, withMetroHttpArchive, validateMetroHttpArchive } = require('./http-archive.cjs')

const owned: Array<() => Promise<unknown>> = []
export const identity = { version: 1, producer: 'react-native', target: 'react-native-ios', runId: randomUUID(), invocationId: randomUUID() }

afterEach(async () => {
  const errors = []
  for (const cleanup of owned.splice(0).reverse()) {
    try {
      await cleanup()
    }
    catch (error) { errors.push(error) }
  }
  if (errors.length) {
    throw new AggregateError(errors, 'HTTP测试资源清理失败')
  }
})

export async function setup(handler: (request: IncomingMessage, response: ServerResponse) => void, compress = false, limits: Record<string, number> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'weapp-metro-http-test-'))
  owned.push(() => rm(root, { recursive: true, force: true }))
  const directory = path.join(root, 'http-observation')
  const token = randomUUID()
  const archive = createMetroHttpArchive({ directory, identity, token, ...limits })
  owned.push(() => archive.settle())
  const next = vi.fn()
  const inner = vi.fn(handler)
  const middleware = archive.enhance(inner)
  const server = createServer((request, response) => {
    if (compress && request.url?.includes('.bundle')) {
      const original = response.end
      response.end = function (this: ServerResponse, chunk: any, ...args: any[]) {
        this.setHeader('Content-Encoding', 'gzip')
        return Reflect.apply(original, this, [gzipSync(Buffer.from(chunk)), ...args])
      } as typeof response.end
    }
    middleware(request, response, next)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  owned.push(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('缺测试HTTP端口')
  }
  const url = `http://127.0.0.1:${address.port}`
  const drain = async () => {
    const response = await fetch(`${url}${archive.controlPath}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    const body = await response.text()
    if (response.status !== 200) {
      throw new Error(body)
    }
    expect(response.status).toBe(200)
    return validateMetroHttpArchive(directory, identity)
  }
  return { archive, root, directory, url, drain, inner, next, token }
}
