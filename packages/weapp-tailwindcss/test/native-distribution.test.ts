import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { subset } from 'semver'
import { afterEach, describe, expect, it } from 'vitest'
import { sourceDigest, stageBinding, thirdPartyLicenseFile, verifyBinding, verifyDistribution, writeBindingMetadata } from '../native/distribution.mjs'
import { bindingFileName, nativeTargets } from '../native/targets.mjs'

const directories: string[] = []

function fixture() {
  const repoRoot = mkdtempSync(join(tmpdir(), 'weapp-tw-native-artifacts-'))
  directories.push(repoRoot)
  const roots = { core: join(repoRoot, 'packages', 'weapp-tailwindcss', 'native'), postcss: join(repoRoot, 'packages', 'postcss', 'native') }
  const optionalDependencies = Object.fromEntries(Object.values(nativeTargets).map(({ suffix }) => [`@weapp-tailwindcss/native-${suffix}`, 'workspace:*']))
  for (const [kernel, root] of Object.entries(roots)) {
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'bindings'))
    writeFileSync(join(root, '..', 'package.json'), JSON.stringify({ version: kernel === 'core' ? '5.5.11' : '3.0.0', optionalDependencies }))
    for (const name of ['Cargo.toml', 'Cargo.lock', 'build.rs']) {
      writeFileSync(join(root, name), `${kernel}\n`)
    }
    writeFileSync(join(root, 'src', 'lib.rs'), 'pub fn value() {}\n')
    if (kernel === 'postcss') {
      writeFileSync(join(root, thirdPartyLicenseFile), 'MIT license fixture\n')
    }
  }
  for (const [target, { suffix }] of Object.entries(nativeTargets)) {
    const platformRoot = join(repoRoot, 'packages-native', suffix)
    mkdirSync(platformRoot, { recursive: true })
    const [os, cpu, libc] = suffix.split('-')
    writeFileSync(join(platformRoot, 'package.json'), JSON.stringify({
      name: `@weapp-tailwindcss/native-${suffix}`,
      version: '5.5.11',
      os: [os],
      cpu: [cpu],
      ...(os === 'linux' ? { libc: [libc === 'gnu' ? 'glibc' : 'musl'] } : {}),
      exports: { '.': `./${bindingFileName(suffix)}`, './postcss': `./${bindingFileName(suffix, 'postcss')}` },
      files: ['*.node', thirdPartyLicenseFile],
    }))
    for (const [kernel, root] of Object.entries(roots)) {
      writeFileSync(join(root, 'bindings', bindingFileName(suffix, kernel)), `${target}:${kernel}`)
      writeBindingMetadata(target, root, kernel)
      stageBinding(target, root, repoRoot, kernel)
    }
  }
  return { repoRoot, roots }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('native distribution release gates', () => {
  it('keeps every consumer Node range within the shared platform package support range', () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
    const consumers = ['weapp-tailwindcss', 'postcss'].map(name => JSON.parse(readFileSync(join(repoRoot, 'packages', name, 'package.json'), 'utf8')))
    for (const { suffix } of Object.values(nativeTargets)) {
      const platform = JSON.parse(readFileSync(join(repoRoot, 'packages-native', suffix, 'package.json'), 'utf8'))
      for (const consumer of consumers) {
        expect(subset(consumer.engines.node, platform.engines.node), `${consumer.name} Node range in ${platform.name}`).toBe(true)
      }
    }
  })

  it('accepts a complete eight-platform/two-kernel set even when consumer versions differ', () => {
    const { repoRoot, roots } = fixture()
    expect(() => verifyDistribution(roots, repoRoot)).not.toThrow()
  })

  it('rejects a missing CSS artifact instead of publishing a partial platform package', () => {
    const { repoRoot, roots } = fixture()
    rmSync(join(repoRoot, 'packages-native', 'linux-arm64-musl', bindingFileName('linux-arm64-musl', 'postcss')))
    expect(() => verifyDistribution(roots, repoRoot)).toThrow()
  })

  it('rejects a missing third-party license', () => {
    const { repoRoot, roots } = fixture()
    rmSync(join(repoRoot, 'packages-native', 'darwin-x64', thirdPartyLicenseFile))
    expect(() => verifyDistribution(roots, repoRoot)).toThrow(thirdPartyLicenseFile)
  })

  it('rejects a changed third-party license', () => {
    const { repoRoot, roots } = fixture()
    writeFileSync(join(repoRoot, 'packages-native', 'linux-arm64-gnu', thirdPartyLicenseFile), 'different license')
    expect(() => verifyDistribution(roots, repoRoot)).toThrow(`mismatched ${thirdPartyLicenseFile}`)
  })

  it('includes the license in the normalized source digest', () => {
    const { roots } = fixture()
    const file = join(roots.postcss, thirdPartyLicenseFile)
    const before = sourceDigest(roots.postcss)
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('\n', '\r\n'))
    expect(sourceDigest(roots.postcss)).toBe(before)
    writeFileSync(file, 'updated license\n')
    expect(sourceDigest(roots.postcss)).not.toBe(before)
  })

  it('rejects changed bytes even when the metadata still names the expected target', () => {
    const { repoRoot, roots } = fixture()
    writeFileSync(join(repoRoot, 'packages-native', 'win32-arm64-msvc', bindingFileName('win32-arm64-msvc')), 'different binary')
    expect(() => verifyDistribution(roots, repoRoot)).toThrow('sha256')
  })

  it('rejects artifacts produced before a Rust source change', () => {
    const { repoRoot, roots } = fixture()
    writeFileSync(join(roots.postcss, 'src', 'lib.rs'), 'pub fn changed() {}')
    expect(() => verifyDistribution(roots, repoRoot)).toThrow('sourceDigest')
  })

  it('rejects a binding assigned to another target or kernel', () => {
    const { roots } = fixture()
    const file = join(roots.core, 'bindings', bindingFileName('darwin-arm64'))
    const metadata = JSON.parse(readFileSync(`${file}.json`, 'utf8'))
    expect(() => verifyBinding('x86_64-apple-darwin', file, metadata, roots.core)).toThrow('target')
    expect(() => verifyBinding('aarch64-apple-darwin', file, metadata, roots.core, 'postcss')).toThrow('kernel')
  })

  it.each(['version', 'libc', 'scripts', 'exports', 'files'])('rejects an unsafe platform package manifest: %s', (key) => {
    const { repoRoot, roots } = fixture()
    const manifestPath = join(repoRoot, 'packages-native', 'linux-x64-gnu', 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest[key] = key === 'version' ? '0.0.0' : key === 'libc' ? ['musl'] : {}
    writeFileSync(manifestPath, JSON.stringify(manifest))
    expect(() => verifyDistribution(roots, repoRoot)).toThrow()
  })

  it('hashes LF and CRLF checkout contents consistently', () => {
    const { roots } = fixture()
    const before = sourceDigest(roots.core)
    for (const name of ['Cargo.toml', 'Cargo.lock', 'build.rs', join('src', 'lib.rs')]) {
      const file = join(roots.core, name)
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll('\n', '\r\n'))
    }
    expect(sourceDigest(roots.core)).toBe(before)
  })
})
