import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getWorkspacePackages } from 'repoctl'
import { describe, expect, it } from 'vitest'
import { findWorkspaceProtocols } from '../../../../scripts/verify-packed-packages.mjs'

const workspaceRoot = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)))

describe('发布包 manifest 校验', () => {
  it('发现全部公开 workspace 包', async () => {
    const packages = await getWorkspacePackages(workspaceRoot)

    expect(packages).toHaveLength(38)
    expect(packages.map(pkg => pkg.manifest.name)).toEqual(expect.arrayContaining([
      'weapp-tailwindcss',
      '@weapp-tailwindcss/cli',
      '@weapp-tailwindcss/engine',
      '@weapp-tailwindcss/escape',
      '@weapp-tailwindcss/source-scan',
      '@weapp-tailwindcss/runtime',
      'theme-transition',
      '@weapp-tailwindcss/native-darwin-arm64',
      '@weapp-tailwindcss/native-darwin-x64',
      '@weapp-tailwindcss/native-linux-arm64-gnu',
      '@weapp-tailwindcss/native-linux-arm64-musl',
      '@weapp-tailwindcss/native-linux-x64-gnu',
      '@weapp-tailwindcss/native-linux-x64-musl',
      '@weapp-tailwindcss/native-win32-arm64-msvc',
      '@weapp-tailwindcss/native-win32-x64-msvc',
    ]))
    expect(packages.every(pkg => pkg.manifest.private !== true)).toBe(true)
  })

  it('公开包之间统一使用 repoctl 要求的 workspace:* 协议', async () => {
    const packages = await getWorkspacePackages(workspaceRoot)
    const workspacePackageNames = new Set(packages.map(pkg => pkg.manifest.name))
    const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const
    const violations = packages.flatMap((pkg) => {
      return dependencySections.flatMap((section) => {
        const dependencies = pkg.manifest[section]
        if (!dependencies) {
          return []
        }
        return Object.entries(dependencies)
          .filter(([name, version]) => workspacePackageNames.has(name) && version !== 'workspace:*')
          .map(([name, version]) => `${pkg.manifest.name} -> ${section}.${name}=${version}`)
      })
    })

    expect(violations).toEqual([])
  })

  it('递归定位残留的 workspace 协议', () => {
    expect(findWorkspaceProtocols({
      dependencies: {
        '@weapp-tailwindcss/shared': 'workspace:*',
      },
      publishConfig: {
        directory: 'dist',
      },
    })).toEqual(['$.dependencies.@weapp-tailwindcss/shared'])
  })
})
