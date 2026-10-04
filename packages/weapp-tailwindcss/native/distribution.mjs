import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { bindingFileName, nativePackagePrefix, nativeTargets } from './targets.mjs'

export const nativeRoot = dirname(fileURLToPath(import.meta.url))
export const repositoryRoot = resolve(nativeRoot, '..', '..', '..')
export const kernelRoots = { core: nativeRoot, postcss: resolve(nativeRoot, '..', '..', 'postcss', 'native') }

function metadataFile(kernel) {
  return kernel === 'core' ? 'native-metadata.json' : 'postcss-native-metadata.json'
}

function json(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function digest(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

export function sourceDigest(root = nativeRoot) {
  const hash = createHash('sha256')
  const content = file => readFileSync(file, 'utf8').replaceAll('\r\n', '\n')
  function visit(directory, parts) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const child = join(directory, entry.name)
      const segments = [...parts, entry.name]
      if (entry.isDirectory()) {
        visit(child, segments)
      }
      else if (entry.name.endsWith('.rs')) {
        hash.update(JSON.stringify(segments)).update('\0').update(content(child)).update('\0')
      }
    }
  }
  for (const name of ['Cargo.toml', 'Cargo.lock', 'build.rs']) {
    hash.update(name).update('\0').update(content(join(root, name))).update('\0')
  }
  visit(join(root, 'src'), ['src'])
  return hash.digest('hex')
}

export function writeBindingMetadata(target, root = nativeRoot, kernel = 'core') {
  const definition = nativeTargets[target]
  if (!definition) {
    throw new Error(`Unsupported native target: ${target}`)
  }
  const { suffix } = definition
  const filename = bindingFileName(suffix, kernel)
  const manifest = json(join(root, '..', 'package.json'))
  const metadata = {
    kernel,
    target,
    suffix,
    version: manifest.version,
    sourceDigest: sourceDigest(root),
    sha256: digest(join(root, 'bindings', filename)),
  }
  writeFileSync(join(root, 'bindings', `${filename}.json`), `${JSON.stringify(metadata, null, 2)}\n`)
  return metadata
}

export function verifyBinding(target, binding, metadata, root = nativeRoot, kernel = 'core') {
  const { suffix } = nativeTargets[target]
  const manifest = json(join(root, '..', 'package.json'))
  const expected = {
    kernel,
    target,
    suffix,
    version: manifest.version,
    sourceDigest: sourceDigest(root),
    sha256: digest(binding),
  }
  for (const [key, value] of Object.entries(expected)) {
    if (metadata[key] !== value) {
      throw new Error(`Native artifact ${suffix} has mismatched ${key}: ${metadata[key]} (expected ${value})`)
    }
  }
  return expected
}

export function stageBinding(target, root = nativeRoot, repoRoot = repositoryRoot, kernel = 'core') {
  const { suffix } = nativeTargets[target]
  const filename = bindingFileName(suffix, kernel)
  const input = join(root, 'bindings', filename)
  const metadata = verifyBinding(target, input, json(`${input}.json`), root, kernel)
  const destination = join(repoRoot, 'packages-native', suffix)
  const manifest = json(join(destination, 'package.json'))
  const platformVersion = json(join(repoRoot, 'packages', 'weapp-tailwindcss', 'package.json')).version
  if (manifest.name !== `${nativePackagePrefix}${suffix}` || manifest.version !== platformVersion) {
    throw new Error(`Native package ${suffix} must match the compiler package name/version`)
  }
  mkdirSync(destination, { recursive: true })
  copyFileSync(input, join(destination, filename))
  writeFileSync(join(destination, metadataFile(kernel)), `${JSON.stringify(metadata, null, 2)}\n`)
}

export function verifyDistribution(roots = kernelRoots, repoRoot = repositoryRoot) {
  for (const [target, { suffix }] of Object.entries(nativeTargets)) {
    const directory = join(repoRoot, 'packages-native', suffix)
    const manifest = json(join(directory, 'package.json'))
    const compiler = json(join(roots.core, '..', 'package.json'))
    if (manifest.name !== `${nativePackagePrefix}${suffix}` || manifest.version !== compiler.version) {
      throw new Error(`Native package ${suffix} version differs from weapp-tailwindcss`)
    }
    if (manifest.scripts) {
      throw new Error(`Native package ${suffix} must not execute lifecycle scripts`)
    }
    const [os, cpu, libc] = suffix.split('-')
    if (JSON.stringify(manifest.os) !== JSON.stringify([os]) || JSON.stringify(manifest.cpu) !== JSON.stringify([cpu])) {
      throw new Error(`Native package ${suffix} has invalid os/cpu constraints`)
    }
    if (os === 'linux' && JSON.stringify(manifest.libc) !== JSON.stringify([libc === 'gnu' ? 'glibc' : 'musl'])) {
      throw new Error(`Native package ${suffix} has invalid libc constraints`)
    }
    for (const [kernel, root] of Object.entries(roots)) {
      const consumer = json(join(root, '..', 'package.json'))
      if (consumer.optionalDependencies?.[manifest.name] !== 'workspace:*') {
        throw new Error(`Native package ${suffix} must be an exact workspace optional dependency of ${consumer.name}`)
      }
      const exportName = kernel === 'core' ? '.' : './postcss'
      if (manifest.exports?.[exportName] !== `./${bindingFileName(suffix, kernel)}`) {
        throw new Error(`Native package ${suffix} does not export its ${kernel} binding`)
      }
      verifyBinding(target, join(directory, bindingFileName(suffix, kernel)), json(join(directory, metadataFile(kernel))), root, kernel)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const operation = process.argv[2]
  if (operation === 'stage') {
    for (const target of Object.keys(nativeTargets)) {
      for (const [kernel, root] of Object.entries(kernelRoots)) {
        stageBinding(target, root, repositoryRoot, kernel)
      }
    }
    verifyDistribution()
  }
  else if (operation === 'verify') {
    verifyDistribution()
  }
  else {
    throw new Error('Usage: node native/distribution.mjs stage|verify')
  }
  process.stdout.write(`Verified ${Object.keys(nativeTargets).length} native platform artifacts\n`)
}
