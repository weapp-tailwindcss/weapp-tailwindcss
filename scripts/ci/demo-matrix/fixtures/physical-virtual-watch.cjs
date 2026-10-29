const assert = require('node:assert/strict')
const { mkdir, mkdtemp, realpath, rename, rm, writeFile } = require('node:fs/promises')
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
  const events = []
  const startedAt = Date.now()
  const observedWatchpacks = new WeakSet()
  const record = entry => events.push({ at: Date.now() - startedAt, ...entry })
  let phase = 'initial'
  let attachedBuild = 0
  let generation = 0
  const watchFileSystem = compiler.watchFileSystem
  const originalWatch = watchFileSystem.watch
  watchFileSystem.watch = function (...args) {
    const result = originalWatch.apply(this, args)
    attachedBuild = builds.length
    const watcherGeneration = ++generation
    record({ event: 'attached', phase, build: attachedBuild, generation: watcherGeneration, startTime: args[3] })
    let owner = this
    while (owner.wfs) owner = owner.wfs
    if (!observedWatchpacks.has(owner.watcher)) {
      observedWatchpacks.add(owner.watcher)
      for (const method of ['_onChange', '_onRemove']) {
        const original = owner.watcher[method]
        owner.watcher[method] = function (...eventArgs) {
          record({ event: method, phase, generation: watcherGeneration, args: eventArgs })
          return original.apply(this, eventArgs)
        }
      }
    }
    return result
  }
  compiler.hooks.watchRun.tap('WatchEvidence', () => record({ event: 'watchRun', phase, modified: [...(compiler.modifiedFiles ?? [])], removed: [...(compiler.removedFiles ?? [])] }))
  const watcher = compiler.watch({ aggregateTimeout: 100 }, (error, stats) => {
    builds.push({ error, errors: stats?.toJson({ all: false, errors: true }).errors ?? [], missing: [...(stats?.compilation.missingDependencies ?? [])] })
    record({ event: 'callback', phase, build: builds.length })
  })
  const bundlePath = path.join(output, 'main.cjs')
  const values = []
  async function replacePhysical(value) {
    // 在监听图之外完整写入，再替换输入，避免把截断与写入当成两次业务改动。
    const staged = path.join(output, 'next-physical.js')
    await writeFile(staged, `export default ${value}`)
    await rename(staged, physical)
  }
  function readValue(expected) {
    delete require.cache[require.resolve(bundlePath)]
    const value = require(bundlePath).default
    assert.equal(value, expected)
    values.push(value)
  }
  async function waitForBuild(previous, missing = false) {
    const deadline = Date.now() + 10_000
    // 完成回调早于异步缓存收尾与下一轮监听挂载；输入改动必须等待监听真正接管。
    while ((builds.length <= previous || attachedBuild !== builds.length || watcher.running) && Date.now() < deadline) await delay(25)
    assert.ok(builds.length > previous, 'Expected physical/virtual update did not rebuild')
    if (previous > 0) assert.equal(builds.length, previous + 1, 'One physical transaction unexpectedly rebuilt more than once')
    assert.equal(attachedBuild, builds.length, 'Current compilation has not reattached its watcher')
    assert.equal(watcher.running, false, 'Current compilation has not completed')
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
    await waitForBuild(0)
    assert.ok(builds.length <= 2, `Idle virtual module repeatedly rebuilt: ${builds.length}`)
    assert.ifError(builds.at(-1).error)
    assert.deepEqual(builds.at(-1).errors, [])
    assert.deepEqual(builds.at(-1).missing, [])
    readValue(43)
    let previous = builds.length
    phase = 'physical update'
    await replacePhysical(2)
    await waitForBuild(previous)
    readValue(44)
    await settle(builds.length)
    previous = builds.length
    phase = 'physical deletion'
    await rm(physical)
    await waitForBuild(previous, true)
    await settle(builds.length)
    previous = builds.length
    phase = 'physical recovery'
    await replacePhysical(3)
    await waitForBuild(previous)
    readValue(45)
    await settle(builds.length)
    previous = builds.length
    phase = 'mixed physical deletion and virtual update'
    let owner = compiler.watchFileSystem
    while (owner.wfs) owner = owner.wfs
    const watchpack = owner.watcher
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
    phase = 'mixed recovery'
    await replacePhysical(4)
    await waitForBuild(previous)
    readValue(88)
    await settle(builds.length)
    process.stdout.write(`${JSON.stringify({ values, builds: builds.length, deletionErrors: builds.filter(build => build.errors.length > 0).length })}\n`)
  }
  catch (error) {
    process.stderr.write(`Physical/virtual watcher evidence: ${JSON.stringify({ phase, generation, attachedBuild, builds, events })}\n`)
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
