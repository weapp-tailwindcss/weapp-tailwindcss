import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

interface PackageJson {
  name: string
  type?: string
  main?: string
  module?: string
  devDependencies?: Record<string, string>
  exports?: Record<string, unknown>
  publishConfig?: {
    exports?: Record<string, unknown>
  }
}

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const packageRoots = ['packages', 'packages-runtime'].map(root => path.join(repoRoot, root))
const migratedPackages = new Set([
  '@weapp-tailwindcss/cli',
  '@weapp-tailwindcss/babel',
  '@weapp-tailwindcss/debug-uni-app-x',
  '@weapp-tailwindcss/init',
  '@weapp-tailwindcss/logger',
  '@weapp-tailwindcss/postcss',
  '@weapp-tailwindcss/reset',
  '@weapp-tailwindcss/shared',
  '@weapp-tailwindcss/typography',
  'weapp-style-injector',
  'weapp-tailwindcss',
])

async function readWorkspacePackages(roots = packageRoots) {
  const packages: PackageJson[] = []
  for (const directory of roots) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }
      const packageJsonPath = path.join(directory, entry.name, 'package.json')
      try {
        packages.push(JSON.parse(await readFile(packageJsonPath, 'utf8')) as PackageJson)
      }
      catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
          continue
        }
        throw error
      }
    }
  }
  return packages
}

function expectModuleExtensions(exports: Record<string, unknown>) {
  for (const target of Object.values(exports)) {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      continue
    }
    const conditions = target as Record<string, unknown>
    if (typeof conditions.import === 'string') {
      expect(conditions.import).toMatch(/\.js$/)
    }
    if (typeof conditions.require === 'string') {
      expect(conditions.require).toMatch(/\.cjs$/)
    }
  }
}

describe('package module metadata', () => {
  it('ignores workspace directories without a package manifest', async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'weapp-tw-workspace-'))
    try {
      const packageDirectory = path.join(workspaceRoot, 'actual-package')
      await mkdir(packageDirectory)
      await mkdir(path.join(workspaceRoot, 'stale-package-artifacts'))
      await writeFile(
        path.join(packageDirectory, 'package.json'),
        JSON.stringify({ name: 'actual-package', type: 'module' }),
      )

      await expect(readWorkspacePackages([workspaceRoot])).resolves.toEqual([
        { name: 'actual-package', type: 'module' },
      ])
    }
    finally {
      await rm(workspaceRoot, { recursive: true, force: true })
    }
  })

  it('keeps Babel 7 framework loaders isolated from the root Babel 8 toolchain', async () => {
    const rootPackage = JSON.parse(
      await readFile(path.join(repoRoot, 'package.json'), 'utf8'),
    ) as PackageJson
    const mpxPackage = JSON.parse(
      await readFile(path.join(repoRoot, 'demo/mpx-tailwindcss-v4/package.json'), 'utf8'),
    ) as PackageJson

    expect(rootPackage.devDependencies?.['@babel/core']).toBe('catalog:babel8')
    expect(rootPackage.devDependencies?.['babel-loader']).toBeUndefined()
    expect(mpxPackage.devDependencies?.['@babel/core']).toBe('catalog:babelCore7285')
  })

  it('declares type module for every package workspace', async () => {
    const packages = await readWorkspacePackages()

    expect(packages.length).toBeGreaterThan(0)
    expect(packages.filter(pkg => pkg.type !== 'module').map(pkg => pkg.name)).toEqual([])
  })

  it('uses physical .js/.cjs files for migrated dual packages', async () => {
    const packages = await readWorkspacePackages()
    const migrated = packages.filter(pkg => migratedPackages.has(pkg.name))

    expect(migrated.map(pkg => pkg.name).sort()).toEqual([...migratedPackages].sort())
    for (const pkg of migrated) {
      const publishExports = pkg.publishConfig?.exports
      const exports = publishExports ?? pkg.exports
      expect(exports, pkg.name).toBeDefined()
      expectModuleExtensions(exports ?? {})
      if (pkg.main) {
        expect(pkg.main, pkg.name).toMatch(/\.cjs$/)
      }
      if (pkg.module) {
        expect(pkg.module, pkg.name).toMatch(/\.js$/)
      }
    }
  })
})
