import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { getHttpText } from './react-native/native-http'

describe('React Native native HTTP probe', () => {
  it('父任务取消时关闭持续响应，交付原始取消原因', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200)
      response.write('pending')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address() as AddressInfo
      const controller = new AbortController()
      const reason = new Error('startup expired')
      const request = getHttpText(`http://127.0.0.1:${address.port}/status`, 2_000, controller.signal)
      controller.abort(reason)
      await expect(request).rejects.toBe(reason)
    }
    finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })

  it('响应未完成就断开时立即失败', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-length': '100' })
      response.write('incomplete')
      setImmediate(() => response.destroy())
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address() as AddressInfo
      await expect(getHttpText(`http://127.0.0.1:${address.port}/status`)).rejects.toThrow()
    }
    finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })

  it('持续收到数据也必须在绝对请求预算内结束', async () => {
    const timers = new Set<ReturnType<typeof setInterval>>()
    const server = createServer((_request, response) => {
      response.writeHead(200)
      const timer = setInterval(() => response.write('x'), 5)
      timers.add(timer)
      response.once('close', () => {
        clearInterval(timer)
        timers.delete(timer)
      })
      const end = setTimeout(() => response.end(), 200)
      response.once('close', () => clearTimeout(end))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address() as AddressInfo
      await expect(getHttpText(`http://127.0.0.1:${address.port}/status`, 40)).rejects.toThrow('Timed out requesting')
    }
    finally {
      for (const timer of timers) {
        clearInterval(timer)
      }
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })

  it('reads the Metro status endpoint without relying on fetch', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end('packager-status:running')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address() as AddressInfo
      await expect(getHttpText(`http://127.0.0.1:${address.port}/status`)).resolves.toBe('packager-status:running')
    }
    finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
