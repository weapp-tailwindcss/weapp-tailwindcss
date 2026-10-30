import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fromLogical, inside, readBounded } from './files.mjs'

const workspaceSources = new Map([
  ['weapp-tailwindcss', ['packages', 'weapp-tailwindcss']],
  ['@weapp-tailwindcss/postcss', ['packages', 'postcss']],
])

async function locatePackage(root, project, name) {
  const require = createRequire(path.join(project, 'package.json'))
  let packageJson
  try {
    packageJson = require.resolve(`${name}/package.json`)
  }
  catch (error) {
    if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
      throw error
    }
    // 仅隐藏 manifest 的包从本 role 明确的依赖入口读取，不吞掉模块配置错误。
    for (const owner of [project, root]) {
      const candidate = path.join(owner, 'node_modules', ...name.split('/'), 'package.json')
      try {
        await fs.access(candidate)
        packageJson = candidate
        break
      }
      catch (error) {
        if (error.code !== 'ENOENT') {
          throw error
        }
      }
    }
  }
  if (!packageJson) {
    throw new Error(`无法在当前 role 定位 package manifest：${name}`)
  }
  packageJson = await fs.realpath(packageJson)
  if (!inside(root, packageJson)) {
    throw new Error(`解析包借用了外部依赖：${name}`)
  }
  const data = JSON.parse((await readBounded(packageJson)).toString('utf8'))
  if (data.name !== name || typeof data.version !== 'string') {
    throw new Error(`package 身份不符：${name}`)
  }
  return { name, version: data.version, root: path.dirname(packageJson), data, packageJson }
}
async function ownedEntry(root, item, entry) {
  const physical = await fs.realpath(entry)
  if (!inside(root, physical) || !inside(item.root, physical) || !(await fs.stat(physical)).isFile()) {
    throw new Error(`实际 package/bin 入口类型或归属不符：${item.name}`)
  }
  return physical
}

/** 只承认本仓库两个公开 workspace 包明确约定、尚未生成的主 CJS 文件。 */
async function pendingWorkspaceEntry(root, item, error) {
  const directory = workspaceSources.get(item.name)
  if (error.code !== 'MODULE_NOT_FOUND' || !directory || item.root !== path.join(root, ...directory) || item.data.main !== './dist/index.cjs') {
    return undefined
  }
  const exported = item.data.exports?.['.']
  const simpleRequire = exported === './dist/index.cjs'
    || (exported && !Array.isArray(exported) && typeof exported === 'object'
      && Object.keys(exported).every(key => ['style', 'types', 'import', 'require'].includes(key))
      && exported.require === './dist/index.cjs')
  if (item.data.exports !== undefined && !simpleRequire) {
    return undefined
  }
  const expected = path.join(item.root, 'dist', 'index.cjs')
  try {
    await fs.lstat(expected)
  }
  catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
    const directory = path.dirname(expected)
    let stat
    try {
      stat = await fs.lstat(directory)
    }
    catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
      return expected
    }
    if (!stat.isDirectory() || stat.isSymbolicLink() || !inside(item.root, await fs.realpath(directory))) {
      throw new Error(`待构建 dist 类型或归属不符：${item.name}`)
    }
    return expected
  }
}

/** 按固定 workload 的消费方式收集真实入口，不把 CLI 包假设为 CJS API。 */
export async function resolvePackageInput(root, project, name, definition, { allowBuildPending = false } = {}) {
  const item = await locatePackage(root, project, name)
  if (definition.binary?.[0] === name) {
    const binName = definition.binary[1]
    const stringBinMatches = name.slice(name.lastIndexOf('/') + 1) === binName
    const relative = typeof item.data.bin === 'string' ? (stringBinMatches ? item.data.bin : undefined) : item.data.bin?.[binName]
    if (typeof relative !== 'string' || !relative) {
      throw new TypeError(`包缺少真实业务 bin：${name}/${binName}`)
    }
    // npm manifest bin 是逻辑相对路径；统一在此边界转换成宿主文件系统路径。
    const logical = relative.startsWith('./') ? relative.slice(2) : relative
    const entry = await ownedEntry(root, item, fromLogical(item.root, logical))
    if (definition.binarySpecifier) {
      const require = createRequire(path.join(project, 'package.json'))
      const consumed = await ownedEntry(root, item, require.resolve(definition.binarySpecifier))
      if (consumed !== entry) {
        throw new Error(`固定 workload 深层入口与 manifest bin 不一致：${name}`)
      }
      return { ...item, entry, consumption: { kind: 'cli-bin', name: binName, specifier: definition.binarySpecifier }, resolution: 'require-bin-from-project', entryStatus: 'ready' }
    }
    return { ...item, entry, consumption: { kind: 'cli-bin', name: binName }, resolution: 'manifest-bin-from-project', entryStatus: 'ready' }
  }
  const consumption = { kind: 'require', specifier: name }
  const require = createRequire(path.join(project, 'package.json'))
  try {
    const entry = await ownedEntry(root, item, require.resolve(name))
    return { ...item, entry, consumption, resolution: 'require-from-project', entryStatus: 'ready' }
  }
  catch (error) {
    const expectedEntry = allowBuildPending && await pendingWorkspaceEntry(root, item, error)
    if (!expectedEntry) {
      throw error
    }
    return { ...item, consumption, resolution: 'require-from-project', entryStatus: 'build-pending', expectedEntry }
  }
}
