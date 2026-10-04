import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { kernelRoots, stageBinding, writeBindingMetadata } from './distribution.mjs'
import { bindingFileName, nativeTargets } from './targets.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const packageRoot = join(root, 'packages', 'weapp-tailwindcss')
const target = process.argv.find(arg => arg.startsWith('--target='))?.slice('--target='.length)
assert.ok(target && nativeTargets[target], 'Native CI requires an explicit supported Rust target')
const hostSuffix = process.platform === 'linux'
  ? `${process.platform}-${process.arch}-${process.report.getReport().header.glibcVersionRuntime ? 'gnu' : 'musl'}`
  : `${process.platform}-${process.arch}${process.platform === 'win32' ? '-msvc' : ''}`
assert.equal(nativeTargets[target].suffix, hostSuffix, 'Native verification must execute on the actual target architecture and libc')
assert.ok(existsSync(join(packageRoot, 'native', 'test', 'js.ts')), 'Native JS ABI verification must exist before enabling this gate')

function run(command, args, cwd = root, env = process.env) {
  const child = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' && command === 'pnpm' })
  if (child.error || child.status !== 0) {
    throw child.error ?? new Error(`${command} ${args.join(' ')} failed: ${child.signal ?? child.status}`)
  }
}

const nativeEnvironment = { ...process.env, CI: '1', WEAPP_TW_NATIVE: 'required' }
if (!process.argv.includes('--verify-only')) {
  for (const directory of Object.values(kernelRoots)) {
    run('cargo', ['test', '--locked', '--target', target], directory)
    run('cargo', ['clippy', '--locked', '--target', target, '--all-targets', '--', '-D', 'warnings'], directory)
  }
  run(process.execPath, ['native/build.mjs', `--target=${target}`], packageRoot)
  run('cargo', ['build', '--locked', '--release', '--target', target], kernelRoots.postcss)
  const targetRoot = resolve(kernelRoots.postcss, process.env.CARGO_TARGET_DIR ?? 'target')
  const { artifact, suffix } = nativeTargets[target]
  const cssArtifact = artifact.replace('weapp_tailwindcss_native', 'weapp_tailwindcss_postcss_native')
  const bindingRoot = join(kernelRoots.postcss, 'bindings')
  mkdirSync(bindingRoot, { recursive: true })
  copyFileSync(join(targetRoot, target, 'release', cssArtifact), join(bindingRoot, bindingFileName(suffix, 'postcss')))
  writeBindingMetadata(target, kernelRoots.postcss, 'postcss')
  stageBinding(target, kernelRoots.postcss, root, 'postcss')
  run('pnpm', ['--filter', 'weapp-tailwindcss...', 'run', 'build'])
}
run(process.execPath, ['native/verify.mjs'], packageRoot, nativeEnvironment)
run('pnpm', ['--filter', 'weapp-tailwindcss', 'test:native:package'], root, nativeEnvironment)
run('pnpm', ['--filter', 'weapp-tailwindcss', 'exec', 'vitest', 'run', 'test/wxml/Tokenizer.test.ts', 'test/js/oxc-semantic-parity.test.ts', 'test/js/oxc-parser-contract.test.ts', 'test/native-resolve.test.ts', '--update=none', '--coverage.enabled=false'], root, nativeEnvironment)
run('pnpm', ['--filter', '@weapp-tailwindcss/postcss', 'exec', 'vitest', 'run', '--config', 'vitest.native.config.ts', '--update=none', '--coverage.enabled=false'], root, nativeEnvironment)
run('pnpm', ['--filter', '@weapp-tailwindcss/postcss', 'exec', 'vitest', 'run', 'test/native-selectors-loader.test.ts', 'test/native-selector-platform.test.ts', '--update=none', '--coverage.enabled=false'], root, nativeEnvironment)
