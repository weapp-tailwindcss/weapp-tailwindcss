import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { stageBinding, writeBindingMetadata } from './distribution.mjs'
import { nativeTargets } from './targets.mjs'

const nativeRoot = dirname(fileURLToPath(import.meta.url))
const target = process.argv.find(arg => arg.startsWith('--target='))?.slice('--target='.length)

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
if (!resolvedTarget || !nativeTargets[resolvedTarget]) {
  throw new Error(`Unsupported native target: ${resolvedTarget}`)
}
const { suffix, artifact } = nativeTargets[resolvedTarget]
run('cargo', ['build', '--locked', '--release', '--target', resolvedTarget])
const targetRoot = resolve(nativeRoot, process.env.CARGO_TARGET_DIR ?? 'target')
const output = join(targetRoot, resolvedTarget, 'release', artifact)
const bindingRoot = join(nativeRoot, 'bindings')
mkdirSync(bindingRoot, { recursive: true })
const destination = join(bindingRoot, `weapp-tailwindcss-native.${suffix}.node`)
copyFileSync(output, destination)
writeBindingMetadata(resolvedTarget)
stageBinding(resolvedTarget)
process.stdout.write(`${destination}\n`)
