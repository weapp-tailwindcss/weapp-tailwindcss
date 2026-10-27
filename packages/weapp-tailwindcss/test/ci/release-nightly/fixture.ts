import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { writeBindingMetadata } from '../../../../../packages/weapp-tailwindcss/native/distribution.mjs'
import { bindingFileName, nativePackagePrefix, nativeTargets } from '../../../../../packages/weapp-tailwindcss/native/targets.mjs'
import { nativeRoots, writeNativeInput } from '../../../../../scripts/release-nightly/native-inputs.mjs'

export const env = { GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' }
export const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
export function writeJson(file: string, value: unknown) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

export function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'nightly-native-'))
  const original = path.join(root, 'original')
  const source = path.join(root, 'source')
  const packages: Array<{ name: string, directory: string, currentVersion: string, version: string }> = []
  for (const directory of [original, source]) {
    const roots = nativeRoots(directory)
    for (const [kernel, native] of Object.entries(roots)) {
      mkdirSync(path.join(native, 'src'), { recursive: true })
      mkdirSync(path.join(native, 'bindings'))
      for (const name of ['Cargo.toml', 'Cargo.lock', 'build.rs']) {
        writeFileSync(path.join(native, name), `${name}\n`)
      }
      writeFileSync(path.join(native, 'src', 'lib.rs'), `${kernel}\n`)
      const name = kernel === 'core' ? 'weapp-tailwindcss' : '@weapp-tailwindcss/postcss'
      const currentVersion = kernel === 'core' ? '1.0.0' : '2.0.0'
      const version = `${currentVersion}-snapshot.nightly.fixture`
      const manifest = { name, version: directory === original ? currentVersion : version, optionalDependencies: Object.fromEntries(Object.values(nativeTargets).map(({ suffix }) => [`${nativePackagePrefix}${suffix}`, 'workspace:*'])) }
      writeJson(path.join(native, '..', 'package.json'), manifest)
      if (directory === source) {
        packages.push({ name, directory: path.relative(source, path.dirname(native)), currentVersion, version })
      }
    }
    writeFileSync(path.join(roots.postcss, 'THIRD_PARTY_LICENSES.txt'), 'third party license\n')
    for (const { suffix } of Object.values(nativeTargets)) {
      const destination = path.join(directory, 'packages-native', suffix)
      mkdirSync(destination, { recursive: true })
      const [os, cpu, libc] = suffix.split('-')
      writeJson(path.join(destination, 'package.json'), {
        name: `${nativePackagePrefix}${suffix}`,
        version: directory === original ? '1.0.0' : '1.0.0-snapshot.nightly.fixture',
        os: [os],
        cpu: [cpu],
        ...(os === 'linux' ? { libc: [libc === 'gnu' ? 'glibc' : 'musl'] } : {}),
        files: ['THIRD_PARTY_LICENSES.txt'],
        exports: { '.': `./${bindingFileName(suffix)}`, './postcss': `./${bindingFileName(suffix, 'postcss')}` },
      })
    }
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: original, encoding: 'utf8', stdio: 'pipe' }).trim()
  git('init', '--quiet', '--initial-branch=main')
  git('config', 'user.name', 'Fixture')
  git('config', 'user.email', 'fixture@example.test')
  git('add', '.')
  git('commit', '--quiet', '-m', 'chore: native source fixture')
  const commit = git('rev-parse', 'HEAD')
  const tree = git('rev-parse', 'HEAD^{tree}')
  for (const [target, { suffix }] of Object.entries(nativeTargets)) {
    for (const [kernel, native] of Object.entries(nativeRoots(original))) {
      writeFileSync(path.join(native, 'bindings', bindingFileName(suffix, kernel)), `binary-${kernel}-${suffix}`)
      writeBindingMetadata(target, native, kernel)
    }
    writeNativeInput(original, target, { ...env, GITHUB_SHA: commit })
  }
  return { root, original, source, input: path.join(original, 'packages'), context: { directory: source, identity: { kind: 'nightly' as const, commit, buildId: '123-1' }, tree, packages, referenceGitlinks: [] } }
}
