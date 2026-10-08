import type { SpawnSyncReturns } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { clearWorkspaceCache, releasePrerelease } from 'repoctl'
import { afterEach, describe, expect, it } from 'vitest'
import config from '../../../repoctl.config'
import { metadataFile, verifyDistribution } from '../native/distribution.mjs'
import { afterNativeVersion, beforeNativeVersion } from '../native/release.mjs'
import { bindingFileName, nativeTargets } from '../native/targets.mjs'
import { createNativeDistributionFixture } from './helpers/native-distribution'

const directories: string[] = []
const fixture = () => createNativeDistributionFixture(directories)
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value))

function changeVersions({ repoRoot, roots }: ReturnType<typeof fixture>) {
  for (const [kernel, root] of Object.entries(roots)) {
    const manifest = join(root, '..', 'package.json')
    writeJson(manifest, { ...readJson(manifest), version: kernel === 'core' ? '5.5.12-alpha.0' : '3.0.1-alpha.0' })
  }
  for (const { suffix } of Object.values(nativeTargets)) {
    const manifest = join(repoRoot, 'packages-native', suffix, 'package.json')
    writeJson(manifest, { ...readJson(manifest), version: '5.5.12-alpha.0' })
  }
}

afterEach(() => {
  clearWorkspaceCache()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('native artifact repoctl version transition', () => {
  it('updates only versions for unchanged verified artifacts and consumes its beforeVersion evidence', () => {
    const context = fixture()
    const { roots, repoRoot } = context
    beforeNativeVersion(roots, repoRoot)
    const before = readJson(join(roots.core, 'bindings', `${bindingFileName('darwin-arm64')}.json`))
    changeVersions(context)
    expect(() => verifyDistribution(roots, repoRoot)).toThrow('version')
    afterNativeVersion(roots, repoRoot)
    expect(() => verifyDistribution(roots, repoRoot)).not.toThrow()
    expect(readJson(join(roots.core, 'bindings', `${bindingFileName('darwin-arm64')}.json`))).toEqual({ ...before, version: '5.5.12-alpha.0' })
    expect(() => afterNativeVersion(roots, repoRoot)).toThrow('ENOENT')
  })

  it('rejects version relabeling without a verified beforeVersion state', () => {
    const context = fixture()
    changeVersions(context)
    expect(() => afterNativeVersion(context.roots, context.repoRoot)).toThrow('ENOENT')
  })

  it.each(['sourceDigest', 'target', 'suffix', 'sha256', 'version', 'kernel'])('rejects a tampered %s before changing any metadata', (key) => {
    const context = fixture()
    const { roots, repoRoot } = context
    beforeNativeVersion(roots, repoRoot)
    changeVersions(context)
    const first = join(repoRoot, 'packages-native', 'darwin-arm64', metadataFile('core'))
    const unchanged = readFileSync(first, 'utf8')
    const last = join(repoRoot, 'packages-native', 'linux-arm64-musl', metadataFile('postcss'))
    writeJson(last, { ...readJson(last), [key]: 'tampered' })
    expect(() => afterNativeVersion(roots, repoRoot)).toThrow()
    expect(readFileSync(first, 'utf8')).toBe(unchanged)
  })

  it.each(['source', 'downloaded-binary', 'staged-binary', 'platform-version', 'metadata-extra'])('rejects %s changes during versioning', (kind) => {
    const context = fixture()
    const { roots, repoRoot } = context
    beforeNativeVersion(roots, repoRoot)
    changeVersions(context)
    const binding = bindingFileName('linux-arm64-musl', 'postcss')
    if (kind === 'source') {
      writeFileSync(join(roots.postcss, 'src', 'lib.rs'), 'pub fn changed() {}')
    }
    else if (kind === 'downloaded-binary') {
      writeFileSync(join(roots.postcss, 'bindings', binding), 'changed bytes')
    }
    else if (kind === 'staged-binary') {
      writeFileSync(join(repoRoot, 'packages-native', 'linux-arm64-musl', binding), 'changed bytes')
    }
    else if (kind === 'platform-version') {
      const manifest = join(repoRoot, 'packages-native', 'linux-arm64-musl', 'package.json')
      writeJson(manifest, { ...readJson(manifest), version: '5.5.11' })
    }
    else {
      const metadata = join(roots.postcss, 'bindings', `${binding}.json`)
      writeJson(metadata, { ...readJson(metadata), extra: true })
    }
    expect(() => afterNativeVersion(roots, repoRoot)).toThrow()
  })

  it('rejects replaced binaries even when both metadata hashes were recomputed', () => {
    const context = fixture()
    const { roots, repoRoot } = context
    beforeNativeVersion(roots, repoRoot)
    changeVersions(context)
    const suffix = 'linux-arm64-musl'
    const binding = bindingFileName(suffix, 'postcss')
    const metadata = readJson(join(roots.postcss, 'bindings', `${binding}.json`))
    const replaced = 'changed binary and matching hashes'
    metadata.sha256 = createHash('sha256').update(replaced).digest('hex')
    writeFileSync(join(roots.postcss, 'bindings', binding), replaced)
    writeFileSync(join(repoRoot, 'packages-native', suffix, binding), replaced)
    writeJson(join(roots.postcss, 'bindings', `${binding}.json`), metadata)
    writeJson(join(repoRoot, 'packages-native', suffix, metadataFile('postcss')), metadata)
    expect(() => afterNativeVersion(roots, repoRoot)).toThrow('Native metadata changed during versioning')
  })

  it('runs the real repoctl prerelease ordering with a mocked process boundary and verifies the final publish versions', async () => {
    const context = fixture()
    const { roots, repoRoot } = context
    const names = ['weapp-tailwindcss', '@weapp-tailwindcss/postcss', ...Object.values(nativeTargets).map(({ suffix }) => `@weapp-tailwindcss/native-${suffix}`)]
    writeJson(join(repoRoot, 'package.json'), { name: 'native-release-fixture', private: true })
    writeFileSync(join(repoRoot, 'pnpm-workspace.yaml'), `packages:\n  - packages/*\n  - packages-native/*\nversioning:\n  lanes:\n${names.map(name => `    '${name}': alpha`).join('\n')}\n`)
    mkdirSync(join(repoRoot, '.changeset'))
    writeFileSync(join(repoRoot, '.changeset', 'native.md'), '---\n"weapp-tailwindcss": patch\n---\n原生产物预发布回归。\n')
    const calls: string[] = []
    const spawn = ((command: string, args: string[]) => {
      const invocation = [command, ...args].join(' ')
      calls.push(invocation)
      let stdout = ''
      if (invocation === 'pnpm run native:artifacts:before-version') {
        beforeNativeVersion(roots, repoRoot)
      }
      else if (invocation === 'pnpm run release:verify' || invocation === 'pnpm run native:artifacts:verify') {
        verifyDistribution(roots, repoRoot)
      }
      else if (invocation === 'pnpm version -r --no-git-checks --json') {
        changeVersions(context)
        stdout = JSON.stringify(names.map(name => ({
          name,
          currentVersion: name === '@weapp-tailwindcss/postcss' ? '3.0.0' : '5.5.11',
          newVersion: name === '@weapp-tailwindcss/postcss' ? '3.0.1-alpha.0' : '5.5.12-alpha.0',
        })))
      }
      else if (invocation === 'pnpm run native:artifacts:after-version') {
        afterNativeVersion(roots, repoRoot)
      }
      else if (command === 'pnpm' && args[0] === 'publish') {
        expect(calls.at(-2)).toBe('pnpm run native:artifacts:verify')
        verifyDistribution(roots, repoRoot)
        expect(readJson(join(roots.core, 'bindings', `${bindingFileName('darwin-arm64')}.json`)).version).toBe('5.5.12-alpha.0')
        writeJson(join(repoRoot, 'pnpm-publish-summary.json'), { publishedPackages: [] })
      }
      else {
        expect(command).toBe('git')
      }
      return { status: command === 'git' && args[0] === 'diff' ? 1 : 0, stdout, stderr: '' } as SpawnSyncReturns<string>
    }) as NonNullable<Parameters<typeof releasePrerelease>[0]['spawn']>
    await releasePrerelease({ cwd: repoRoot, branch: 'alpha', config: { qualityScripts: [], hooks: config.commands!.release!.hooks }, spawn })
    expect(calls.filter(call => call.startsWith('pnpm '))).toEqual([
      'pnpm run native:artifacts:before-version',
      'pnpm run release:verify',
      'pnpm version -r --no-git-checks --json',
      'pnpm run native:artifacts:after-version',
      'pnpm run native:artifacts:verify',
      'pnpm publish -r --tag alpha --report-summary --provenance --no-git-checks',
    ])
  })
})
