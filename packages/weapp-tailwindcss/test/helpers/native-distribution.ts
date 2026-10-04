import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stageBinding, thirdPartyLicenseFile, writeBindingMetadata } from '../../native/distribution.mjs'
import { bindingFileName, nativeTargets } from '../../native/targets.mjs'

export function createNativeDistributionFixture(directories: string[]) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'weapp-tw-native-artifacts-'))
  directories.push(repoRoot)
  const roots = { core: join(repoRoot, 'packages', 'weapp-tailwindcss', 'native'), postcss: join(repoRoot, 'packages', 'postcss', 'native') }
  const optionalDependencies = Object.fromEntries(Object.values(nativeTargets).map(({ suffix }) => [`@weapp-tailwindcss/native-${suffix}`, 'workspace:*']))
  for (const [kernel, root] of Object.entries(roots)) {
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'bindings'))
    writeFileSync(join(root, '..', 'package.json'), JSON.stringify({ name: kernel === 'core' ? 'weapp-tailwindcss' : '@weapp-tailwindcss/postcss', version: kernel === 'core' ? '5.5.11' : '3.0.0', optionalDependencies }))
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
