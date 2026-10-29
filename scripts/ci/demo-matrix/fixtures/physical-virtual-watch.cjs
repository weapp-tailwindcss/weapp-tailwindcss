const assert = require('node:assert/strict')
const { mkdir, mkdtemp, realpath, rm, writeFile } = require('node:fs/promises')
const { createRequire } = require('node:module')
const { tmpdir } = require('node:os')
const path = require('node:path')
const process = require('node:process')
const { setTimeout: delay } = require('node:timers/promises')

const demoRequire = createRequire(path.resolve('demo/subpackage-taro-webpack-react-tailwindcss-v4/package.json'))
const taroRequire = createRequire(demoRequire.resolve('@tarojs/webpack5-runner/package.json'))
const webpack = (process.argv[2] === 'modern' ? require : taroRequire)('webpack')
const VirtualModulesPlugin = taroRequire('webpack-virtual-modules')

async function main() {
  const temporaryRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'physical-virtual-watch-')))
  const root = path.join(temporaryRoot, 'source')
  const output = path.join(temporaryRoot, 'dist')
  await mkdir(root)
  await mkdir(output)
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  const virtual = path.join(root, 'virtual-entry.js')
  const physical = path.join(root, 'physical.js')
  await writeFile(physical, 'export default 1')
  const source = value => `import physical from './physical.js'; export default ${value} + physical`
  const modules = new VirtualModulesPlugin({ [virtual]: source(42) })
  const compiler = webpack({ mode: 'development', context: root, entry: './virtual-entry.js', output: { path: output, filename: 'main.cjs', library: { type: 'commonjs2' } }, plugins: [modules] })
  compiler.hooks.beforeCompile.tapPromise('BuildDuration', () => delay(100))
  const builds = []
  const watcher = compiler.watch({ aggregateTimeout: 100 }, (error, stats) => {
    builds.push({ error, errors: stats?.toJson({ all: false, errors: true }).errors ?? [], missing: [...(stats?.compilation.missingDependencies ?? [])] })
  })
  const bundlePath = path.join(output, 'main.cjs')
  const values = []
  function readValue(expected) {
    delete require.cache[require.resolve(bundlePath)]
    const value = require(bundlePath).default
    assert.equal(value, expected)
    values.push(value)
  }
  async function waitForBuild(previous, missing = false) {
    const deadline = Date.now() + 10_000
    while (builds.length <= previous && Date.now() < deadline) await delay(25)
    assert.ok(builds.length > previous, 'Expected physical/virtual update did not rebuild')
    const result = builds.at(-1)
    assert.ifError(result.error)
    if (missing) {
      assert.ok(result.errors.length > 0, 'Physical deletion must produce a compilation error')
      assert.ok(result.missing.includes(physical), 'Deleted physical dependency must remain watched')
    }
    else {
      assert.deepEqual(result.errors, [])
      assert.deepEqual(result.missing, [])
    }
    return builds.length
  }
  async function settle(previous) {
    await delay(1000)
    assert.equal(builds.length, previous, 'Physical/virtual update did not settle')
  }
  try {
    await waitForBuild(0)
    await delay(1500)
    assert.ok(builds.length <= 2, `Idle virtual module repeatedly rebuilt: ${builds.length}`)
    assert.ifError(builds.at(-1).error)
    assert.deepEqual(builds.at(-1).errors, [])
    assert.deepEqual(builds.at(-1).missing, [])
    readValue(43)
    let previous = builds.length
    await writeFile(physical, 'export default 2')
    await waitForBuild(previous)
    readValue(44)
    await settle(builds.length)
    previous = builds.length
    await rm(physical)
    await waitForBuild(previous, true)
    await settle(builds.length)
    previous = builds.length
    await writeFile(physical, 'export default 3')
    await waitForBuild(previous)
    readValue(45)
    await settle(builds.length)
    previous = builds.length
    let watchFileSystem = compiler.watchFileSystem
    while (watchFileSystem.wfs) watchFileSystem = watchFileSystem.wfs
    const watchpack = watchFileSystem.watcher
    // 由真实删除事件触发同批虚拟更新，避免把尚未被 polling 发现的磁盘变化当成缓存失效。
    const updateDuringRemoval = (file) => {
      if (file !== physical) return
      watchpack.removeListener('remove', updateDuringRemoval)
      modules.writeModule(virtual, source(84))
      watchpack._onRemove(virtual, virtual, 'watch (missing on attach)')
    }
    watchpack.on('remove', updateDuringRemoval)
    await rm(physical)
    await waitForBuild(previous, true)
    await settle(builds.length)
    previous = builds.length
    await writeFile(physical, 'export default 4')
    await waitForBuild(previous)
    readValue(88)
    await settle(builds.length)
    process.stdout.write(`${JSON.stringify({ values, builds: builds.length, deletionErrors: builds.filter(build => build.errors.length > 0).length })}\n`)
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
