import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wranglerBin = path.resolve(websiteRoot, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js')

async function getAvailablePort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  if (!address || typeof address === 'string') {
    throw new Error('无法分配 Wrangler 本地测试端口')
  }
  return address.port
}

async function waitForServer(baseUrl: URL, exited: Promise<never>) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await Promise.race([fetch(baseUrl), exited])
      if (response.status === 200) {
        return
      }
    }
    catch (error) {
      if (error instanceof Error && error.message.startsWith('Wrangler 提前退出')) {
        throw error
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Wrangler 本地服务器未能启动')
}

async function expectResponse(baseUrl: URL, pathname: string, status: number, location?: string) {
  const response = await fetch(new URL(pathname, baseUrl), { redirect: 'manual' })
  if (response.status !== status) {
    throw new Error(`${pathname} expected ${status}, received ${response.status}`)
  }
  if (location && response.headers.get('location') !== location) {
    throw new Error(`${pathname} expected Location ${location}, received ${response.headers.get('location')}`)
  }
  return response
}

async function main() {
  const port = await getAvailablePort()
  const baseUrl = new URL(`http://127.0.0.1:${port}`)
  const child = spawn(process.execPath, [
    wranglerBin,
    'dev',
    '--config',
    path.join(websiteRoot, 'wrangler.jsonc'),
    '--local',
    '--port',
    String(port),
  ], {
    cwd: websiteRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  child.stderr.on('data', chunk => stderr += String(chunk))
  const exited = new Promise<never>((_, reject) => {
    child.once('exit', (code, signal) => reject(new Error(`Wrangler 提前退出：code=${code ?? 'null'}, signal=${signal ?? 'null'}`)))
    child.once('error', reject)
  })

  try {
    await waitForServer(baseUrl, exited)
    await expectResponse(baseUrl, '/', 200)
    await expectResponse(baseUrl, '/zh-cn/', 200)
    await expectResponse(baseUrl, '/en/docs/intro', 301, '/docs/intro')
    await expectResponse(baseUrl, '/docs/migrations/v2', 301, '/docs/migrations/v5')
    await expectResponse(baseUrl, '/unknown-worker-route', 404)
    await expectResponse(baseUrl, '/zh-cn/unknown-worker-route', 404)
    const cssFiles = (await readdir(path.join(websiteRoot, 'build', 'assets', 'css'))).filter(filename => filename.endsWith('.css')).sort()
    if (cssFiles.length === 0) {
      throw new Error('Wrangler 本地测试找不到构建后的 CSS 资源')
    }
    const cssResponse = await expectResponse(baseUrl, `/assets/css/${cssFiles[0]}`, 200)
    if (cssResponse.headers.get('cache-control') !== 'public, max-age=31536000, immutable') {
      throw new Error('Wrangler 本地静态资源缺少 immutable 缓存策略')
    }
    console.log('[website] Wrangler local 200/301/404/cache verification passed')
  }
  catch (error) {
    if (stderr) {
      console.error(stderr)
    }
    throw error
  }
  finally {
    child.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
