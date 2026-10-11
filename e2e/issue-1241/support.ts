import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { prepareDependencies } from './dependencies'

export const repositoryRoot = path.resolve(import.meta.dirname, '../..')
export const artifacts = path.join(repositoryRoot, 'e2e', '.artifacts', 'issue-1241')
let state: Promise<{ root: string, packageRoot: string, temporary: string, require: NodeJS.Require }> | undefined

export function dependencies() {
  return state ??= (async () => {
    const packageRoot = await realpath(path.join(repositoryRoot, 'packages', 'weapp-tailwindcss'))
    const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-issue-1241-')))
    const preparation = path.join(artifacts, 'preparation', path.basename(temporary))
    const root = await realpath(await prepareDependencies(temporary, preparation))
    const require = createRequire(path.join(root, 'package.json'))
    const versions = Object.fromEntries(await Promise.all(['@dcloudio/vite-plugin-uni', 'tailwindcss', 'vite', 'vue'].map(async (name) => {
      const file = await realpath(require.resolve(`${name}/package.json`))
      const manifest = JSON.parse(await readFile(file, 'utf8'))
      return [name, { version: manifest.version, file }]
    })))
    await save('framework-pnpm-lock.yaml', await readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8'))
    await save('identity.json', { root, packageRoot, temporary, preparation, versions, node: process.version })
    return { root, packageRoot, temporary, require }
  })()
}

export async function save(name: string, value: unknown) {
  const file = path.join(artifacts, name)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`)
}
