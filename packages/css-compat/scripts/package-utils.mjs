import assert from 'node:assert/strict'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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

export async function install(directory, dependencies) {
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'css-compat-isolated-consumer', private: true, type: 'module', dependencies }))
  await execa('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile'], { cwd: directory, env: { CI: '1' } })
}

export function tarballDependency(tarball) {
  return pathToFileURL(tarball).href
}
