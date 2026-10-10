import assert from 'node:assert/strict'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

export const packageRoot = fileURLToPath(new URL('..', import.meta.url))
export const repositoryRoot = path.resolve(packageRoot, '..', '..')

export async function pack(tempRoot, source = packageRoot) {
  const destination = path.join(tempRoot, 'packed', path.basename(source))
  await mkdir(destination, { recursive: true })
  await execa('pnpm', ['pack', '--pack-destination', destination], { cwd: source })
  const tarballs = (await readdir(destination)).filter(file => file.endsWith('.tgz'))
  assert.equal(tarballs.length, 1)
  return path.join(destination, tarballs[0])
}

export async function install(directory, dependencies, tarballs = {}) {
  await mkdir(directory, { recursive: true })
  const files = new Map(Object.entries(tarballs).map(([name, file], index) => [`/tarball-${index}.tgz`, { name, file }]))
  const server = createServer(async (request, response) => {
    const entry = files.get(request.url)
    if (!entry) {
      response.writeHead(404)
      response.end()
      return
    }
    try {
      const body = await readFile(entry.file)
      response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': body.length })
      response.end(body)
    }
    catch {
      response.writeHead(500)
      response.end('无法读取验证 tarball')
    }
  })
  try {
    const installed = { ...dependencies }
    if (files.size) {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      const address = server.address()
      assert.ok(address && typeof address === 'object')
      // pnpm 12 的 file fetcher 会误处理物理路径中的 URL 编码和井号；通过受控 HTTP 路由消费原始 tgz。
      for (const [route, { name }] of files) {
        installed[name] = `http://127.0.0.1:${address.port}${route}`
      }
    }
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'css-compat-isolated-consumer', private: true, type: 'module', dependencies: installed }))
    await execa('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile'], { cwd: directory, env: { CI: '1' } })
  }
  finally {
    if (server.listening) {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  }
}
