import assert from 'node:assert/strict'
import { mkdtemp, readdir } from 'node:fs/promises'
import path from 'node:path'
import { getWorkspacePackages } from 'repoctl'

/** 收集候选包的 workspace 运行时依赖闭包，排除仅供开发使用的包。 */
export function collectRuntimePackages(packages, entryName) {
  const byName = new Map(packages.map(pkg => [pkg.manifest.name, pkg]))
  const selected = new Map()
  function visit(name) {
    if (selected.has(name)) {
      return
    }
    const pkg = byName.get(name)
    assert.ok(pkg, `缺少 workspace 运行时依赖：${name}`)
    selected.set(name, pkg)
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [dependency, range] of Object.entries(pkg.manifest[field] ?? {})) {
        if (range.startsWith('workspace:')) {
          visit(dependency)
        }
      }
    }
  }
  visit(entryName)
  return [...selected.values()]
}

/** pnpm 的 file: 依赖是路径说明符，保留空格并仅在此边界统一分隔符。 */
export function createPnpmFileSpecifier(consumerRoot, tarball, pathApi = path) {
  return `file:${pathApi.relative(consumerRoot, tarball).replaceAll(pathApi.sep, '/')}`
}

/** 将同一提交的运行时依赖打包为独立 tarball，供隔离消费项目安装。 */
export async function packRuntimeDependencies(repoRoot, entryName, packRoot, consumerRoot, runPnpm) {
  const packages = collectRuntimePackages(await getWorkspacePackages(repoRoot), entryName)
  const overrides = {}
  for (const pkg of packages) {
    const destination = await mkdtemp(path.join(packRoot, 'package-'))
    await runPnpm(['pack', '--pack-destination', destination], pkg.rootDir)
    const tarballs = (await readdir(destination)).filter(file => file.endsWith('.tgz'))
    assert.equal(tarballs.length, 1, `${pkg.manifest.name} 应生成一个 tarball`)
    overrides[pkg.manifest.name] = createPnpmFileSpecifier(consumerRoot, path.join(destination, tarballs[0]))
  }
  return overrides
}
