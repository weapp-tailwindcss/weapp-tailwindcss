const assert = require('node:assert/strict')
const { mkdir, mkdtemp, readdir, realpath, rm, writeFile } = require('node:fs/promises')
const { createRequire } = require('node:module')
const { tmpdir } = require('node:os')
const path = require('node:path')
const process = require('node:process')
const { setTimeout: delay } = require('node:timers/promises')

const demoRequire = createRequire(path.resolve('demo/subpackage-taro-webpack-react-tailwindcss-v4/package.json'))
const taroRequire = createRequire(demoRequire.resolve('@tarojs/webpack5-runner/package.json'))
const webpackRequire = process.argv[2] === 'modern' ? require : taroRequire
const webpack = webpackRequire('webpack')
const VirtualModulesPlugin = taroRequire('webpack-virtual-modules')

async function main() {
  const temporaryRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'demo-virtual-watch-')))
  const root = path.join(temporaryRoot, 'source')
  const output = path.join(temporaryRoot, 'dist')
  await mkdir(root)
  // 解析图也会记录输入目录的父目录，必须在 watch 开始前完成项目目录初始化。
  await mkdir(output)
  // 明确包边界，避免解析器监听共享临时目录中的缺失 package.json。
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  const initialSourceEntries = await readdir(root)
  const initialProjectEntries = await readdir(temporaryRoot)
  const file = path.join(root, 'virtual-entry.js')
  const modules = new VirtualModulesPlugin({ [file]: 'export default 42' })
  // 输出与输入分离，避免创建产物目录触发真实的输入目录变更。
  const compiler = webpack({ mode: 'development', context: root, entry: './virtual-entry.js', output: { path: output, filename: 'main.cjs', library: { type: 'commonjs2' } }, plugins: [modules] })
  // 编译跨过轮询间隔，稳定复现虚拟文件被重复报告缺失的条件。
  compiler.hooks.beforeCompile.tapPromise('BuildDuration', () => delay(100))
  const invalidations = []
  const dependencyGraphs = []
  compiler.hooks.invalid.tap('WatchEvidence', file => invalidations.push(file))
  let builds = 0
  let buildError
  const watcher = compiler.watch({ aggregateTimeout: 100 }, (error, stats) => {
    builds++
    const missing = [...(stats?.compilation.missingDependencies ?? [])]
    dependencyGraphs.push({
      files: [...(stats?.compilation.fileDependencies ?? [])],
      contexts: [...(stats?.compilation.contextDependencies ?? [])],
      missing,
      build: [...(stats?.compilation.buildDependencies ?? [])],
    })
    if (missing.length) {
      buildError = new Error(`Virtual fixture has unexpected missing dependencies: ${JSON.stringify(missing)}`)
    }
    if (error || stats.hasErrors()) {
      buildError = error ?? new Error(stats.toString({ all: false, errors: true }))
    }
  })
  async function waitForBuild(previous) {
    const deadline = Date.now() + 10_000
    while (builds <= previous && Date.now() < deadline) {
      await delay(25)
    }
    assert.ifError(buildError)
    assert.ok(builds > previous, 'The virtual module update did not rebuild')
  }
  try {
    await waitForBuild(0)
    assert.deepEqual(await readdir(root), initialSourceEntries, 'Compilation changed the watched input directory')
    assert.deepEqual(await readdir(temporaryRoot), initialProjectEntries, 'Compilation changed the watched project parent directory')
    await delay(1500)
    const initialBuilds = builds
    assert.ok(initialBuilds <= 2, `Idle virtual module repeatedly rebuilt: ${initialBuilds}; invalidations=${JSON.stringify(invalidations)}`)
    const bundlePath = path.join(output, 'main.cjs')
    const readValue = () => {
      delete require.cache[require.resolve(bundlePath)]
      return require(bundlePath).default
    }
    assert.equal(readValue(), 42)
    modules.writeModule(file, 'export default 84')
    let watchFileSystem = compiler.watchFileSystem
    while (watchFileSystem.wfs) watchFileSystem = watchFileSystem.wfs
    // 重现真实更新与磁盘缺失通知同批到达，不能让缺失通知覆盖已聚合的更新。
    watchFileSystem.watcher._onRemove(file, file, 'watch (missing on attach)')
    await waitForBuild(initialBuilds)
    const updatedBuilds = builds
    await delay(1000)
    assert.ifError(buildError)
    assert.equal(builds, updatedBuilds, 'Virtual module update did not settle')
    assert.equal(readValue(), 84)
    assert.deepEqual(await readdir(root), initialSourceEntries, 'Compilation changed the watched input directory')
    assert.deepEqual(await readdir(temporaryRoot), initialProjectEntries, 'Compilation changed the watched project parent directory')
    process.stdout.write(`${JSON.stringify({ initialBuilds, updatedBuilds, value: readValue(), webpack: webpackRequire('webpack/package.json').version, watchpack: createRequire(webpackRequire.resolve('webpack/package.json'))('watchpack/package.json').version, projectRoot: temporaryRoot, dependencyGraphs })}\n`)
  }
  catch (error) {
    process.stderr.write(`Virtual watcher evidence: ${JSON.stringify({ invalidations, dependencyGraphs })}\n`)
    throw error
  }
  finally {
    await new Promise((resolve, reject) => watcher.close(error => error ? reject(error) : resolve()))
    await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
