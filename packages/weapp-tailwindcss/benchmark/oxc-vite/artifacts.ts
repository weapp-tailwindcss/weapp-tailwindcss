import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export function hash(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

interface BuildOutput {
  output: Array<{ fileName: string, type: string, code?: string, source?: string | Uint8Array }>
}

export function fingerprintBuild(result: unknown) {
  const builds = (Array.isArray(result) ? result : [result]) as BuildOutput[]
  const artifacts = builds.flatMap(build => build.output.map((entry) => {
    const content = entry.type === 'chunk' ? entry.code! : entry.source!
    return { name: entry.fileName, bytes: Buffer.byteLength(content), sha256: hash(content) }
  })).sort((left, right) => left.name.localeCompare(right.name))
  return { artifacts, sha256: hash(JSON.stringify(artifacts)) }
}

export async function inputFingerprint(root: string) {
  const files: string[] = []
  async function collect(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', 'dist-weapp', '.git'].includes(entry.name)) {
          await collect(filename)
        }
      }
      else if (entry.isFile()) {
        files.push(filename)
      }
    }
  }
  await collect(path.join(root, 'demo', 'web', 'vue-vite-tailwindcss-v4'))
  await collect(path.join(root, 'packages', 'weapp-tailwindcss', 'dist'))
  for (const segments of [['pnpm-lock.yaml'], ['demo', 'web', 'shared', 'vite-target.ts'], ['packages', 'weapp-tailwindcss', 'package.json']]) {
    files.push(path.resolve(root, ...segments))
  }
  const inputs = await Promise.all(files.sort().map(async file => ({ file: path.relative(root, file), sha256: hash(await readFile(file)) })))
  return { sha256: hash(JSON.stringify(inputs)), inputs }
}
