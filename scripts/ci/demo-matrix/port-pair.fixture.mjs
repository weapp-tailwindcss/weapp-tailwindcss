import { createServer } from 'node:http'

async function reservePort(port) {
  const server = createServer((_request, response) => response.end('wrong-server'))
  await new Promise((resolve, reject) => {
    function failed(error) {
      server.removeListener('listening', ready)
      reject(error)
    }
    function ready() {
      server.removeListener('error', failed)
      resolve()
    }
    server.once('error', failed)
    server.once('listening', ready)
    server.listen(port, '127.0.0.1')
  })
  return {
    port: server.address().port,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  }
}

/** 只重选夹具端口，不重试 Vite 启动或业务验证。 */
export async function reserveFallbackPortPair({ reserve = reservePort, attempts = 16 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const occupant = await reserve(0)
    let successor
    try {
      if (occupant.port === 65535) {
        await occupant.close()
        continue
      }
      successor = await reserve(occupant.port + 1)
      await successor.close()
      return occupant
    }
    catch (error) {
      await occupant.close()
      if (!['EADDRINUSE', 'EACCES'].includes(error.code) || successor) {
        throw error
      }
    }
  }
  throw new Error(`无法在 ${attempts} 次夹具配置内取得相邻的可绑定端口`)
}
