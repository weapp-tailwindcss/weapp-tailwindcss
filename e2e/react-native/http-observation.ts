import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'

const require = createRequire(import.meta.url)
const { validateMetroHttpArchive } = require('./http-archive.cjs')

/** 单独归档宿主响应调用快照，不改阶段协议或设备交付声明。 */
export async function prepareMetroHttpObservation(repoRoot: string, artifacts: string, versions: Record<string, string>) {
  const session = JSON.parse(await readFile(path.join(artifacts, 'runtime-session.json'), 'utf8'))
  const [commit, status] = await Promise.all([
    execa('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }),
    execa('git', ['status', '--porcelain'], { cwd: repoRoot }),
  ])
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  const observer = await Promise.all(['http-archive.cjs', 'http-archive-validation.cjs'].map(async name => ({ name, sha256: hash(await readFile(path.join(import.meta.dirname, name))) })))
  let resolver = createRequire(path.join(repoRoot, 'examples', 'react-native-expo', 'package.json'))
  const tools: Record<string, { version: string, sha256: string }> = {}
  for (const name of ['expo', '@expo/cli', '@expo/metro', 'metro']) {
    const file = resolver.resolve(`${name}/package.json`)
    const bytes = await readFile(file)
    tools[name] = { version: JSON.parse(bytes.toString()).version, sha256: hash(bytes) }
    resolver = createRequire(file)
  }
  const identity = {
    ...session,
    sourceCommit: commit.stdout.trim(),
    sourceDirty: Boolean(status.stdout.trim()),
    lockfileSha256: hash(await readFile(path.join(repoRoot, 'pnpm-lock.yaml'))),
    observer,
    metroConfigSha256: hash(await readFile(path.join(repoRoot, 'examples', 'react-native-expo', 'metro.config.js'))),
    tools,
    node: process.version,
    versions,
  }
  const directory = path.join(artifacts, 'http-observation')
  const token = randomUUID()
  return {
    environment: { RN_METRO_HTTP_ARCHIVE: JSON.stringify({ directory, identity, token }) },
    async drain() {
      const url = new URL(`/__weapp_metro_observation/${session.invocationId}/drain`, 'http://127.0.0.1:8081')
      const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) })
      if (response.status !== 200 || await response.text() !== 'drained') {
        throw new Error('Metro HTTP 观察未完成收尾')
      }
      return validateMetroHttpArchive(directory, identity)
    },
  }
}
