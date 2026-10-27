import assert from 'node:assert/strict'
import process from 'node:process'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { createVitePluginConstruction } from '../../../src/bundlers/vite/shared/plugin-construction.ts'
import { createDeferredVitePlugins } from '../../../src/bundlers/vite/shared/plugin-slots.ts'

async function collect() {
  for (let attempt = 0; attempt < 8; attempt++) {
    await nextTurn()
    globalThis.gc()
  }
  await nextTurn()
}

function call(plugin, name, context, ...args) {
  const hook = plugin[name]
  return (typeof hook === 'function' ? hook : hook?.handler)?.apply(context, args)
}

async function exercise(failureMode, nested) {
  const references = []
  const gate = Promise.withResolvers()
  let cleanups = 0
  const observe = (label, result = {}) => {
    references.push({ label, value: new WeakRef(result) })
    return result
  }
  const extensionSlot = { name: 'extension', hooks: { configResolved: true, transform: true, closeWatcher: true } }
  const extension = () => {
    // 真实工厂私有资源只能由委托闭包持有；外层工厂不会捕获本次实例资源。
    const resource = observe('extension:private-resource')
    const transform = observe('extension:private-handler', () => {
      assert.ok(resource)
      return observe('transform-result')
    })
    return {
      name: 'extension',
      async transform() {
        await gate.promise
        return transform()
      },
      closeWatcher() {
        assert.ok(resource)
        cleanups++
        if (failureMode) {
          const failure = new Error('cleanup failed')
          if (failureMode === 'nested') {
            const cause = new Error('cleanup cause', { cause: failure })
            failure.cause = cause
            throw new AggregateError([new AggregateError([failure], 'inner cleanup')], 'outer cleanup', { cause })
          }
          throw failure
        }
        return observe('cleanup-result')
      },
    }
  }
  const owner = () => {
    const resource = observe('owner:private-resource')
    const handler = observe('owner:private-handler', () => {
      assert.ok(resource)
    })
    return { name: 'owner', closeWatcher: { order: 'post', sequential: true, handler } }
  }
  const plugins = createDeferredVitePlugins([
    extensionSlot,
    { name: 'owner', ownsSession: true, hooks: { closeWatcher: { order: 'post', sequential: true } } },
  ], () => [
    ...(nested ? createDeferredVitePlugins([extensionSlot], () => [extension()]) : [extension()]),
    owner(),
  ])
  const resolved = Object.assign(observe('resolved-config'), { command: 'build', build: { watch: {} } })
  for (const plugin of plugins) {
    await call(plugin, 'configResolved', observe(`${plugin.name}:configResolved`), resolved)
  }
  const task = call(plugins[0], 'transform', observe('extension:transform'), '', 'source.js')
  const extensionClose = call(plugins[0], 'closeWatcher', observe('extension:closeWatcher'))
  const closed = call(plugins[1], 'closeWatcher', observe('owner:closeWatcher'))
  // 同一轮登记 rejection handler，避免故意失败场景产生未处理拒绝。
  const completion = failureMode ? assert.rejects(closed, /初始化或清理失败/) : closed
  gate.resolve()
  await task
  await extensionClose
  await completion
  await call(plugins[0], 'closeWatcher', observe('extension:repeated-closeWatcher'))
  assert.equal(call(plugins[1], 'closeWatcher', observe('owner:repeated-closeWatcher')), closed)
  assert.equal(cleanups, 1, '清空清理引用后，重复关闭不能重跑扩展')
  // 只返回弱引用，运行结束后宿主仍长期持有插件数组和关闭 Promise。
  return { plugins, references, closed }
}

async function exerciseConstruction(cleanupFails) {
  const references = []
  const observe = (label) => {
    const result = {}
    references.push({ label, value: new WeakRef(result) })
    return result
  }
  const [plugin] = createDeferredVitePlugins([
    { name: 'owner', ownsSession: true, hooks: { closeWatcher: { order: 'post', sequential: true } } },
  ], () => {
    const construction = createVitePluginConstruction()
    return construction.run(() => {
      const resource = observe('construction-resource')
      construction.addCleanup(() => {
        assert.ok(resource)
        if (cleanupFails) {
          throw new Error('construction cleanup failed')
        }
      }, 0)
      throw new Error('construction failed')
    })
  })
  const resolved = { command: 'build', build: { watch: {} } }
  const closed = call(plugin, 'configResolved', observe('construction:configResolved'), resolved)
  await assert.rejects(closed)
  assert.equal(call(plugin, 'closeWatcher', observe('construction:closeWatcher')), closed)
  return { plugin, closed, references }
}

async function main() {
  for (const nested of [false, true]) {
    for (const failureMode of [false, 'plain', 'nested']) {
      const instance = await exercise(failureMode, nested)
      await collect()
      assert.deepEqual(instance.references.filter(reference => reference.value.deref() !== undefined).map(reference => reference.label), [], `永久关闭不能保留真实委托私有资源、配置、插件 this 或任务结果：nested=${nested}, failure=${failureMode}`)
      assert.throws(() => call(instance.plugins[0], 'transform', {}, '', 'source.js'), /不再接收/)
      assert.equal(call(instance.plugins[1], 'closeWatcher', {}), instance.closed)
    }
  }

  for (const cleanupFails of [false, true]) {
    const instance = await exerciseConstruction(cleanupFails)
    await collect()
    assert.deepEqual(instance.references.filter(reference => reference.value.deref() !== undefined).map(reference => reference.label), [], '构造失败回滚后不能保留宿主 this 或已释放资源')
    assert.equal(call(instance.plugin, 'closeWatcher', {}), instance.closed)
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
