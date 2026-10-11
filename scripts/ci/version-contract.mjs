import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import semver from 'semver'

export async function readPackageJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

export function declaredPackageManager(manifest) {
  const match = /^pnpm@([^+]+)(?:\+sha(?:224|256|384|512)\.[a-f\d]+)?$/i.exec(String(manifest.packageManager ?? ''))
  if (!match || !semver.valid(match[1])) {
    throw new Error(`Invalid packageManager: ${manifest.packageManager}`)
  }
  return { name: 'pnpm', version: match[1] }
}

/** 校验真实安装版本，精确版本与 semver 范围都以 manifest 为准。 */
export function assertDependencyVersions(manifest, versions) {
  for (const [name, version] of Object.entries(versions)) {
    const range = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name] ?? manifest.optionalDependencies?.[name]
    assert.ok(typeof range === 'string' && semver.validRange(range), `Missing or invalid dependency range: ${name}`)
    assert.ok(semver.valid(version) && semver.satisfies(version, range), `${name}@${version} does not satisfy ${range}`)
  }
}

export const repositoryManifest = await readPackageJson(new URL('../../package.json', import.meta.url))
export const repositoryPackageManager = declaredPackageManager(repositoryManifest)

/** 安装切换后直接读取元数据，避免 require 的路径和 JSON 缓存返回上一轮版本。 */
export async function readInstalledDependencyVersions(project, names) {
  return Object.fromEntries(await Promise.all(names.map(async (name) => {
    const manifest = await readPackageJson(path.join(project, 'node_modules', name, 'package.json'))
    return [name, manifest.version]
  })))
}
