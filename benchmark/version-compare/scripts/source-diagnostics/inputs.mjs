import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assertDirectoryOwned, fileReceipt, fromLogical, inside, walkFiles } from './files.mjs'
import { resolvePackageInput } from './package-inputs.mjs'

export const kinds = Object.freeze({
  watch: {
    project: '.',
    packages: ['weapp-tailwindcss', '@weapp-tailwindcss/postcss', 'vite'],
    sources: ['benchmark/performance/src/watch-lifecycle.mjs', 'benchmark/performance/src/watch-lifecycle/control.mjs', 'benchmark/performance/src/stats.mjs', 'benchmark/performance/test/watch-lifecycle.test.mjs', 'benchmark/performance/test/helpers/watch-measurement.mjs', 'benchmark/performance/test/fixtures/watch/vite.css'],
  },
  taro: {
    project: 'demo/taro-webpack-react-tailwindcss-v4',
    packages: ['weapp-tailwindcss', '@weapp-tailwindcss/postcss', '@tarojs/cli', '@tarojs/webpack5-runner', 'webpack'],
    sources: ['scripts/taro-build-runner.mjs'],
    binary: ['@tarojs/cli', 'taro'],
    binarySpecifier: '@tarojs/cli/bin/taro',
  },
  runtime: {
    project: 'demo/weapp-vite-tailwindcss-v4',
    packages: ['weapp-tailwindcss', '@weapp-tailwindcss/postcss', 'weapp-vite', 'vite'],
    sources: ['scripts/weapp-vite-e2e-watch.mjs'],
    binary: ['weapp-vite', 'weapp-vite'],
  },
})
export async function collectInputs(root, kind, sourceFiles) {
  const definition = kinds[kind]
  if (!definition) {
    throw new Error('kind 必须为 watch/taro/runtime')
  }
  const project = fromLogical(root, definition.project === '.' ? 'package.json' : `${definition.project}/package.json`)
  const projectDirectory = path.dirname(project)
  const files = new Map()
  const add = async (file, category) => {
    const receipt = await fileReceipt(file, {
      root,
      kind: category,
    })
    const previous = files.get(receipt.physical)
    if (previous?.kind === 'dist' && ['package-entry', 'bin'].includes(category)) {
      return previous
    }
    files.set(receipt.physical, receipt)
    return receipt
  }
  const dependencies = []
  const dependencyDirectories = new Set([path.join(root, 'node_modules'), path.join(root, 'node_modules', '.pnpm'), path.join(root, 'node_modules', '.bin'), path.join(projectDirectory, 'node_modules'), path.join(projectDirectory, 'node_modules', '.bin')])
  for (const directory of dependencyDirectories) {
    dependencies.push(await assertDirectoryOwned(root, directory))
  }
  for (const directory of dependencyDirectories) {
    if (path.basename(directory) !== '.bin') {
      continue
    }
    for (const entry of await fs.readdir(directory)) {
      const file = path.join(directory, entry)
      if (!(await fs.stat(file)).isFile()) {
        throw new Error('命令入口不是普通文件')
      }
      await add(file, 'bin-shim')
    }
  }
  await add(path.join(root, 'package.json'), 'package-json')
  await add(path.join(root, 'pnpm-lock.yaml'), 'lock')
  await add(project, 'package-json')
  for (const source of sourceFiles) {
    if (['pnpm-workspace.yaml', '.npmrc', '.pnpmfile.cjs'].includes(source.logical)) {
      await add(fromLogical(root, source.logical), 'config')
    }
  }
  for (const source of definition.sources) {
    await add(fromLogical(root, source), 'source')
  }
  const projectPrefix = definition.project === '.' ? '' : `${definition.project}/`
  for (const source of sourceFiles) {
    const local = source.logical.startsWith(projectPrefix) ? source.logical.slice(projectPrefix.length) : undefined
    if (local !== undefined && (/^(?:vite|postcss|tailwind|babel|eslint)\.config\.[^/]+$/.test(local) || /^tsconfig[^/]*\.json$/.test(local) || local.startsWith('config/'))) {
      await add(fromLogical(root, source.logical), 'config')
    }
  }
  const packages = []
  const located = new Map()
  for (const name of definition.packages) {
    const item = await resolvePackageInput(root, projectDirectory, name, definition)
    located.set(name, item)
    const packageJson = await add(item.packageJson, 'package-json')
    const entry = await add(item.entry, item.consumption.kind === 'cli-bin' ? 'bin' : 'package-entry')
    packages.push({
      name,
      version: item.version,
      packageJson,
      entry,
      resolution: item.resolution,
      consumption: item.consumption,
    })
    const dist = path.join(item.root, 'dist')
    let distExists = true
    try {
      await fs.lstat(dist)
    }
    catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
      distExists = false
    }
    if (!distExists && (name === 'weapp-tailwindcss' || name === '@weapp-tailwindcss/postcss')) {
      throw new Error(`构建后的公开包缺少 dist：${name}`)
    }
    if (distExists) {
      await assertDirectoryOwned(root, dist)
      for (const logical of await walkFiles(dist)) {
        await add(fromLogical(dist, logical), 'dist')
      }
    }
  }
  if (kind === 'watch') {
    const require = createRequire(path.join(root, 'package.json'))
    await add(require.resolve('weapp-tailwindcss/vite'), 'package-entry')
  }
  const binaries = []
  if (definition.binary) {
    const [packageName, name] = definition.binary
    const item = located.get(packageName)
    if (item.consumption.kind !== 'cli-bin' || item.consumption.name !== name) {
      throw new Error('业务 bin 消费身份与固定 workload 不符')
    }
    binaries.push({
      name,
      packageName,
      packageJson: await add(item.packageJson, 'package-json'),
      entry: await add(item.entry, 'bin'),
    })
  }
  return {
    project: projectDirectory,
    files: [...files.values()].sort((left, right) => left.physical.localeCompare(right.physical)),
    packages,
    binaries,
    dependencies,
  }
}

/** 安装完成后、执行构建前，先拒绝借用的依赖目录和实际 package/bin。 */
export async function verifyInstalledOwnership(root, kind, { allowBuildPending = false } = {}) {
  const definition = kinds[kind]
  const project = definition.project === '.' ? root : fromLogical(root, definition.project)
  const directories = new Set([path.join(root, 'node_modules'), path.join(root, 'node_modules', '.pnpm'), path.join(root, 'node_modules', '.bin'), path.join(project, 'node_modules'), path.join(project, 'node_modules', '.bin')])
  for (const directory of directories) {
    await assertDirectoryOwned(root, directory)
    if (path.basename(directory) === '.bin') {
      for (const name of await fs.readdir(directory)) {
        if (!inside(root, await fs.realpath(path.join(directory, name)))) {
          throw new Error('命令入口借用外部文件')
        }
      }
    }
  }
  const packages = []
  for (const name of definition.packages) {
    const item = await resolvePackageInput(root, project, name, definition, { allowBuildPending })
    packages.push({
      name,
      packageJson: item.packageJson,
      consumption: item.consumption,
      resolution: item.resolution,
      entryStatus: item.entryStatus,
      ...(item.entry ? { entry: item.entry } : { expectedEntry: item.expectedEntry }),
    })
  }
  return { project, packages }
}
