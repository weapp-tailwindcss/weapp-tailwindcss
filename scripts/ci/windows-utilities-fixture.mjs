import assert from 'node:assert/strict'
import { cp, readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

/** 仅复制夹具输入，避免复制已安装依赖时将软链改写为源目录的绝对路径。 */
export async function copyWindowsUtilitiesFixture(fixture, project) {
  const generated = new Set(['node_modules', 'dist'].map(name => path.resolve(fixture, name)))
  await cp(fixture, project, { recursive: true, filter: source => !generated.has(path.resolve(source)) })
}

/** 按当前平台路径规则检查文件归属，拒绝同名前缀、父目录和跨盘符路径。 */
export function isFixtureOwnedPath(root, file, pathApi = path) {
  const relative = pathApi.relative(root, file)
  return relative !== '' && !pathApi.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${pathApi.sep}`)
}

/** 验证依赖、虚拟 store、命令目录及实际 Taro 入口均由临时项目独立拥有。 */
export async function verifyWindowsUtilitiesFixtureIsolation(project) {
  const root = await realpath(project)
  const modules = path.join(root, 'node_modules')
  const virtualStore = path.join(modules, '.pnpm')
  const bin = path.join(modules, '.bin')
  for (const directory of [modules, virtualStore, bin]) {
    assert.equal(await realpath(directory), directory, `临时夹具不得借用依赖目录：${directory}`)
  }
  const ownedFile = async (file, label) => {
    const actual = await realpath(file)
    assert.ok(isFixtureOwnedPath(modules, actual), `临时夹具的 ${label} 必须来自自身依赖目录：${actual}`)
    return actual
  }
  const dependencies = {}
  // 原位替换安装后从直接依赖槽取真实包身份，避免 Node 的模块解析缓存保留旧版。
  for (const [name, segments] of [
    ['weapp-tailwindcss', ['weapp-tailwindcss']],
    ['tailwindcss', ['tailwindcss']],
    ['@tarojs/cli', ['@tarojs', 'cli']],
    ['webpack', ['webpack']],
  ]) {
    dependencies[name] = await ownedFile(path.join(modules, ...segments, 'package.json'), name)
  }
  const coreRequire = createRequire(dependencies['weapp-tailwindcss'])
  const coreManifest = JSON.parse(await readFile(dependencies['weapp-tailwindcss'], 'utf8'))
  dependencies['@weapp-tailwindcss/postcss'] = await ownedFile(coreRequire.resolve('@weapp-tailwindcss/postcss/package.json'), '@weapp-tailwindcss/postcss')
  const engines = ['@weapp-tailwindcss/engine', '@tailwindcss-mangle/engine'].filter(name => Object.hasOwn(coreManifest.dependencies ?? {}, name))
  assert.equal(engines.length, 1, '临时夹具必须从核心包声明的唯一引擎解析编译器依赖')
  const engine = engines[0]
  dependencies[engine] = await ownedFile(coreRequire.resolve(engine), engine)
  const engineRequire = createRequire(dependencies[engine])
  for (const name of ['@tailwindcss/node', '@tailwindcss/oxide']) {
    dependencies[name] = await ownedFile(engineRequire.resolve(name), name)
  }
  const command = await ownedFile(path.join(bin, process.platform === 'win32' ? 'taro.CMD' : 'taro'), 'Taro 命令封装')
  const cli = await ownedFile(path.join(path.dirname(dependencies['@tarojs/cli']), 'bin', 'taro'), 'Taro 实际命令入口')
  return { root, modules, virtualStore, bin, dependencies, command, cli }
}
