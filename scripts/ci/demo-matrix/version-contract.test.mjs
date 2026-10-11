import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertDependencyVersions, declaredPackageManager, readInstalledDependencyVersions, readPackageJson, repositoryManifest } from '../version-contract.mjs'

describe('version contracts', () => {
  it.each(['pnpm@99.2.3', 'pnpm@99.2.3+sha512.abcdef'])('reads an exact package manager without its integrity suffix: %s', (packageManager) => {
    expect(declaredPackageManager({ packageManager })).toEqual({ name: 'pnpm', version: '99.2.3' })
  })

  it('accepts an explicitly selected prerelease', () => {
    expect(declaredPackageManager({ packageManager: 'pnpm@99.0.0-rc.1' }).version).toBe('99.0.0-rc.1')
  })

  it.each([undefined, '', 'npm@99.0.0', 'pnpm@latest', 'pnpm@^99.0.0', 'pnpm@99', 'pnpm@99.0.0+garbage'])('rejects missing or invalid manager: %s', (packageManager) => {
    expect(() => declaredPackageManager({ packageManager })).toThrow('Invalid packageManager')
  })

  it('checks exact, caret, tilde and comparator dependency ranges', () => {
    const manifest = { dependencies: { exact: '8.1.0', caret: '^8.1.0' }, devDependencies: { tilde: '~8.1.0', comparator: '>=8 <9' } }
    expect(() => assertDependencyVersions(manifest, { exact: '8.1.0', caret: '8.4.0', tilde: '8.1.9', comparator: '8.5.0' })).not.toThrow()
    for (const [name, version] of Object.entries({ exact: '8.1.1', caret: '9.0.0', tilde: '8.2.0', comparator: '7.0.0' })) {
      expect(() => assertDependencyVersions(manifest, { [name]: version })).toThrow('does not satisfy')
    }
    expect(() => assertDependencyVersions(manifest, { absent: '8.0.0' })).toThrow('Missing or invalid')
  })

  it('uses upgraded manifests from a temporary project with spaces', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'version contract '))
    try {
      const file = path.join(root, 'package.json')
      for (const major of [88, 99]) {
        await writeFile(file, JSON.stringify({ packageManager: `pnpm@${major}.0.0`, devDependencies: { tailwindcss: `^${major}.1.0` } }))
        const manifest = await readPackageJson(file)
        expect(declaredPackageManager(manifest).version).toBe(`${major}.0.0`)
        expect(() => assertDependencyVersions(manifest, { tailwindcss: `${major}.2.0` })).not.toThrow()
      }
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reads fresh installed metadata after switching package links', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'installed versions '))
    const link = path.join(root, 'node_modules', '@fixture', 'tool')
    try {
      await mkdir(path.dirname(link), { recursive: true })
      for (const version of ['8.0.0', '9.0.0']) {
        const installed = path.join(root, version)
        await mkdir(installed)
        await writeFile(path.join(installed, 'package.json'), JSON.stringify({ version }))
        await symlink(installed, link, 'junction')
        expect(await readInstalledDependencyVersions(root, ['@fixture/tool'])).toEqual({ '@fixture/tool': version })
        await rm(link)
      }
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('shares the root package manager with template validation', async () => {
    const { TEMPLATE_PACKAGE_MANAGER } = await import('../../../e2e/templateContract.ts')
    expect(TEMPLATE_PACKAGE_MANAGER).toBe(repositoryManifest.packageManager)
  })
})
