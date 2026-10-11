import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { getHttpText } from './react-native/native-http'

describe('React Native native HTTP probe', () => {
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
