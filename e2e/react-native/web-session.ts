import { createServer } from 'node:net'

/** 独立 Expo 进程使用临时端口，冲突时由 stdio 管道的非交互模式直接失败。 */
export async function allocateExpoWebPort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  try {
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Missing allocated Expo Web port')
    }
    return address.port
  }
  finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
