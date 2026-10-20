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

/** 占用器持有自己的端口；实际开发服务在 bind 时由 OS 分配端口。 */
export function reserveOccupiedPort() {
  return reservePort(0)
}
