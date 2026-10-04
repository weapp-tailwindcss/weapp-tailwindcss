import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const nativeRoot = dirname(fileURLToPath(import.meta.url))
const target = process.argv.find(arg => arg.startsWith('--target='))?.slice('--target='.length)
const targets = {
  'aarch64-apple-darwin': ['darwin-arm64', 'libweapp_tailwindcss_native.dylib'],
  'x86_64-apple-darwin': ['darwin-x64', 'libweapp_tailwindcss_native.dylib'],
  'aarch64-unknown-linux-gnu': ['linux-arm64-gnu', 'libweapp_tailwindcss_native.so'],
  'x86_64-unknown-linux-gnu': ['linux-x64-gnu', 'libweapp_tailwindcss_native.so'],
  'aarch64-unknown-linux-musl': ['linux-arm64-musl', 'libweapp_tailwindcss_native.so'],
  'x86_64-unknown-linux-musl': ['linux-x64-musl', 'libweapp_tailwindcss_native.so'],
  'aarch64-pc-windows-msvc': ['win32-arm64-msvc', 'weapp_tailwindcss_native.dll'],
  'x86_64-pc-windows-msvc': ['win32-x64-msvc', 'weapp_tailwindcss_native.dll'],
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: nativeRoot, stdio: 'inherit' })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.signal ?? result.status})`)
  }
}

const rustc = spawnSync('rustc', ['-vV'], { cwd: nativeRoot, encoding: 'utf8' })
if (rustc.error || rustc.status !== 0) {
  throw rustc.error ?? new Error(rustc.stderr)
}
const host = /^host: (.+)$/m.exec(rustc.stdout)?.[1]
const resolvedTarget = target ?? process.env.CARGO_BUILD_TARGET ?? host
if (!resolvedTarget || !targets[resolvedTarget]) {
  throw new Error(`Unsupported native target: ${resolvedTarget}`)
}
const [suffix, artifact] = targets[resolvedTarget]
run('cargo', ['build', '--locked', '--release', '--target', resolvedTarget])
const targetRoot = resolve(nativeRoot, process.env.CARGO_TARGET_DIR ?? 'target')
const output = join(targetRoot, resolvedTarget, 'release', artifact)
const bindingRoot = join(nativeRoot, 'bindings')
mkdirSync(bindingRoot, { recursive: true })
const destination = join(bindingRoot, `weapp-tailwindcss-native.${suffix}.node`)
copyFileSync(output, destination)
process.stdout.write(`${destination}\n`)
