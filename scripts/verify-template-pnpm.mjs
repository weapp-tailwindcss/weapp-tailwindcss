import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const templatesRoot = path.join(repositoryRoot, 'templates')

function readPnpmVersion(packageManager, source) {
  const match = /^pnpm@([^+]+)(?:\+sha(?:224|256|384|512)\.[a-f\d]+)?$/i.exec(String(packageManager ?? ''))
  if (!match) {
    throw new Error(`${source} 的 packageManager 无效：${String(packageManager)}`)
  }
  return match[1]
}

function readLockfilePnpm(lockfile, source) {
  const lines = lockfile.split(/\r?\n/)
  const dependencyIndex = lines.findIndex(line => /^\s{4}packageManagerDependencies:\s*$/.test(line))
  const pnpmIndex = dependencyIndex < 0
    ? -1
    : lines.findIndex((line, index) => index > dependencyIndex && /^\s{6}pnpm:\s*$/.test(line))
  const specifier = pnpmIndex < 0 ? null : /^\s{8}specifier:\s+(\S+)\s*$/.exec(lines[pnpmIndex + 1])?.[1]
  const version = pnpmIndex < 0 ? null : /^\s{8}version:\s+(\S+)\s*$/.exec(lines[pnpmIndex + 2])?.[1]
  if (!specifier || !version) {
    throw new Error(`${source} 缺少 packageManagerDependencies.pnpm`)
  }
  return { specifier, version }
}

async function main() {
  const repositoryManifest = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'))
  const expectedPackageManager = repositoryManifest.packageManager
  const expectedVersion = readPnpmVersion(expectedPackageManager, '根 package.json')
  const entries = await readdir(templatesRoot, { withFileTypes: true })
  const errors = []

  for (const entry of entries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const templateRoot = path.join(templatesRoot, entry.name)
    const packageFile = path.join(templateRoot, 'package.json')
    const lockFile = path.join(templateRoot, 'pnpm-lock.yaml')
    let packageManifest
    try {
      packageManifest = JSON.parse(await readFile(packageFile, 'utf8'))
    }
    catch (error) {
      if (error?.code === 'ENOENT') {
        continue
      }
      throw error
    }

    if (packageManifest.packageManager !== expectedPackageManager) {
      errors.push(`${entry.name}/package.json packageManager=${String(packageManifest.packageManager)}，应为 ${expectedPackageManager}`)
    }

    try {
      const lockfile = await readFile(lockFile, 'utf8')
      const lockPnpm = readLockfilePnpm(lockfile, `${entry.name}/pnpm-lock.yaml`)
      if (lockPnpm.specifier !== expectedVersion || lockPnpm.version !== expectedVersion) {
        errors.push(`${entry.name}/pnpm-lock.yaml pnpm=${lockPnpm.specifier}/${lockPnpm.version}，应为 ${expectedVersion}`)
      }
    }
    catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  if (errors.length > 0) {
    console.error('模板 pnpm 工具链与根 package.json 不一致：')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    console.error('请先运行 pnpm templates:update-deps，同步模板 package.json 与 pnpm-lock.yaml。')
    process.exitCode = 1
    return
  }

  console.log(`模板 pnpm 工具链已与 ${expectedPackageManager} 一致。`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
