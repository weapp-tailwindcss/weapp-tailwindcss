import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { extract } from 'tar'
import { describe, expect, it } from 'vitest'
import { pack } from '../scripts/package-utils.mjs'
import { assertPackedPackageVersion, assertPackedWorkspaceDependency } from '../scripts/package-versions.mjs'

async function writePackage(root: string, directory: string, manifest: Record<string, unknown>) {
  const source = path.join(root, 'packages', directory)
  await fs.mkdir(source, { recursive: true })
  await fs.writeFile(path.join(source, 'package.json'), JSON.stringify(manifest))
  return source
}

async function readPackedManifest(root: string, source: string) {
  const tarball = await pack(root, source)
  const destination = path.join(root, 'extracted', path.basename(source))
  await fs.mkdir(destination, { recursive: true })
  await extract({ cwd: destination, file: tarball })
  return JSON.parse(await fs.readFile(path.join(destination, 'package', 'package.json'), 'utf8'))
}

describe('版本发布后的真实 tarball 版本关系', () => {
  it.each([
    { version: '0.1.1', specifier: 'workspace:*', expected: '0.1.1' },
    { version: '0.2.0-beta.1', specifier: 'workspace:*', expected: '0.2.0-beta.1' },
    { version: '0.2.0', specifier: 'workspace:^', expected: '^0.2.0' },
    { version: '0.2.0', specifier: 'workspace:~', expected: '~0.2.0' },
  ])('验证 $version 及 $specifier 的依赖传播', async ({ version, specifier, expected }) => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'css-compat-release-version-'))
    try {
      await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'css-compat-release-fixture', private: true }))
      await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
      const compatibilityManifest = { name: '@weapp-tailwindcss/css-compat', version, license: 'MIT' }
      const adapterManifest = { name: '@weapp-tailwindcss/postcss', version: '3.4.1', license: 'MIT', dependencies: { [compatibilityManifest.name]: specifier } }
      const compatibilitySource = await writePackage(root, 'css-compat', compatibilityManifest)
      const adapterSource = await writePackage(root, 'postcss', adapterManifest)
      const compatibilityPacked = await readPackedManifest(root, compatibilitySource)
      const adapterPacked = await readPackedManifest(root, adapterSource)

      assertPackedPackageVersion(compatibilityPacked, compatibilityManifest)
      assertPackedPackageVersion(adapterPacked, adapterManifest)
      assertPackedWorkspaceDependency(adapterPacked, adapterManifest, compatibilityManifest)
      expect(compatibilityPacked.version).toBe(version)
      expect(adapterPacked.dependencies[compatibilityManifest.name]).toBe(expected)

      // 同一验证仍须拒绝旧 tarball，不能因消除固定初始版本而放过版本不一致。
      expect(() => assertPackedPackageVersion({ ...compatibilityPacked, version: '0.1.0' }, compatibilityManifest)).toThrow()
      expect(() => assertPackedWorkspaceDependency({ ...adapterPacked, dependencies: { [compatibilityManifest.name]: '0.1.0' } }, adapterManifest, compatibilityManifest)).toThrow()
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 60_000)
})
