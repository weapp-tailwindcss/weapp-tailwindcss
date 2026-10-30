import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { afterEach } from 'vitest'
import YAML from 'yaml'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

export async function fixture() {
  const { packageManager } = JSON.parse(await readFile(new URL('../../../../package.json', import.meta.url), 'utf8'))
  const toolVersion = /^pnpm@([^+]+)/.exec(packageManager)?.[1]
  if (!toolVersion) {
    throw new Error('测试 fixture 需要根项目声明 pnpm 版本')
  }
  const toolLock = YAML.parseAllDocuments(await readFile(new URL('../../../../pnpm-lock.yaml', import.meta.url), 'utf8'))[0]!.toJS()
  const root = await mkdtemp(path.join(os.tmpdir(), 'dependency intents '))
  roots.push(root)
  const write = async (file: string, value: string) => {
    const target = path.resolve(root, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, value)
  }
  const pkg = async (dir: string, data: Record<string, unknown>) => {
    await write(path.join(dir, 'package.json'), JSON.stringify({ version: '1.0.0', ...data }))
  }
  const workspace = async (extra = {}) => write('pnpm-workspace.yaml', YAML.stringify({
    packages: ['packages/*', 'packages-runtime/*', 'demo/*'],
    ...extra,
  }))
  const lock = async (importers: Record<string, unknown>, version = toolVersion) => write('pnpm-lock.yaml', [
    YAML.stringify({ ...toolLock, importers: { '.': { ...toolLock.importers['.'], packageManagerDependencies: { pnpm: { specifier: version, version } } } } }),
    YAML.stringify({ lockfileVersion: '9.0', settings: {}, importers }),
  ].map(doc => `---\n${doc}`).join('\n'))
  const read = (file: string) => readFile(path.resolve(root, file), 'utf8')
  await pkg('.', { name: 'fixture-workspace', private: true, packageManager })
  await workspace()
  await lock({})
  return { root, write, pkg, workspace, lock, read }
}

export async function releaseStatus(root: string) {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    if (decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname) !== '/@fixture/a') {
      response.writeHead(404)
      response.end(JSON.stringify({ error: `测试 registry 未提供 ${request.url}` }))
      return
    }
    response.end(JSON.stringify({
      'name': '@fixture/a',
      'dist-tags': { latest: '1.0.0' },
      'versions': { '1.0.0': { name: '@fixture/a', version: '1.0.0' } },
    }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('测试 registry 未分配端口')
  }
  try {
    return await execa('pnpm', ['change', 'status', '--registry', `http://127.0.0.1:${address.port}`], {
      cwd: root,
      reject: false,
      timeout: 15_000,
    })
  }
  finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}
