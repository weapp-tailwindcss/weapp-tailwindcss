import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { getWorkspacePackages } from 'repoctl'
import { extract } from 'tar'

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

export function findWorkspaceProtocols(value, currentPath = '$') {
  if (typeof value === 'string') {
    return value.startsWith('workspace:') ? [currentPath] : []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findWorkspaceProtocols(item, `${currentPath}[${index}]`))
  }
  if (!value || typeof value !== 'object') {
    return []
  }
  return Object.entries(value).flatMap(([key, child]) => findWorkspaceProtocols(child, `${currentPath}.${key}`))
}

function packPackage(pkg, tempRoot) {
  const packDir = mkdtempSync(path.join(tempRoot, 'pack-'))
  execFileSync(pnpmCommand, ['pack', '--pack-destination', packDir], {
    cwd: pkg.rootDir,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  const tarballs = readdirSync(packDir).filter(file => file.endsWith('.tgz'))
  if (tarballs.length !== 1) {
    throw new Error(`${pkg.manifest.name} 打包后预期得到一个 tarball，实际得到 ${tarballs.length} 个`)
  }
  return path.join(packDir, tarballs[0])
}

async function readPackedManifest(tarball, tempRoot) {
  const extractDir = mkdtempSync(path.join(tempRoot, 'extract-'))
  await extract({
    cwd: extractDir,
    file: tarball,
    filter: entryPath => entryPath === 'package/package.json',
  })
  return JSON.parse(readFileSync(path.join(extractDir, 'package', 'package.json'), 'utf8'))
}

export async function verifyPackedPackages(repoRoot = process.cwd()) {
  const packages = (await getWorkspacePackages(repoRoot))
    .filter(pkg => pkg.manifest.name)
    .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name))
  if (!packages.length) {
    throw new Error('没有发现可发布的 workspace 包')
  }

  const tempRoot = mkdtempSync(path.join(tmpdir(), 'weapp-tailwindcss-pack-'))
  try {
    for (const pkg of packages) {
      const tarball = packPackage(pkg, tempRoot)
      const manifest = await readPackedManifest(tarball, tempRoot)
      const workspaceProtocols = findWorkspaceProtocols(manifest)
      if (workspaceProtocols.length) {
        throw new Error(`${pkg.manifest.name} 的打包 manifest 仍包含 workspace: 协议：${workspaceProtocols.join(', ')}`)
      }
      console.log(`已验证 ${pkg.manifest.name}`)
    }
  }
  finally {
    rmSync(tempRoot, { force: true, recursive: true })
  }

  console.log(`已验证 ${packages.length} 个公开包的打包 manifest`)
  return packages.map(pkg => pkg.manifest.name)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyPackedPackages().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
