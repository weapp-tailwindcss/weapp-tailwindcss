import assert from 'node:assert/strict'
import process from 'node:process'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { createStyleHandler } from '@weapp-tailwindcss/postcss/transform'
import { createResolvedCompiler } from '../../../src/core/compiler/compiler.ts'
import { CompilerRootStore } from '../../../src/core/compiler/root-store.ts'

async function collect() {
  for (let attempt = 0; attempt < 8; attempt++) {
    await nextTurn()
    globalThis.gc()
  }
  await nextTurn()
}

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

// 仅以弱引用观察真实 handler 的缓存树；诊断数据不持有编译器或结果。
function observeServices(options, gate) {
  const roots = []
  const actual = createStyleHandler(options)
  const observe = async (result) => {
    roots.push(new WeakRef(result.root))
    gate?.entered.resolve()
    await gate?.released.promise
    return result
  }
  const styleHandler = async (...args) => observe(await actual(...args))
  styleHandler.transformRoot = async (...args) => observe(await actual.transformRoot(...args))
  styleHandler.getPipeline = (...args) => actual.getPipeline(...args)
  const jsHandler = source => ({ code: source })
  const templateHandler = async source => source
  const services = { styleHandler, jsHandler, templateHandler }
  return {
    services,
    references: {
      roots,
      services: new WeakRef(services),
      handlers: [styleHandler, jsHandler, templateHandler, actual].map(handler => new WeakRef(handler)),
    },
  }
}

function createObservedCompiler(options, gate) {
  const { services, references } = observeServices(options, gate)
  const compiler = createResolvedCompiler({ transforms: services })
  return {
    compiler,
    references,
    snapshot: compiler.createSnapshot({ id: 'styles', classSet: new Set(['p-4']), target: 'weapp' }),
  }
}

async function render(instance) {
  const result = await instance.compiler.transformCss('.p-4 { padding: 1rem }', instance.snapshot)
  assert.match(result.css, /padding:/)
}

function assertReleased(references) {
  assert.ok(references.roots.length > 0, '必须先产生真实缓存树')
  assert.equal(references.roots.filter(root => root.deref() !== undefined).length, 0, '关闭的 Compiler 不能保留缓存 AST')
  assert.equal(references.handlers.filter(handler => handler.deref() !== undefined).length, 0, '关闭的 Compiler 不能保留转换 handler')
  assert.equal(references.services.deref(), undefined, '关闭的 Compiler 不能保留转换服务容器')
}

async function independentCachedTransforms() {
  const hits = []
  const options = { cssPreflight: false, onDiagnostic: event => hits.push(event.cache?.hit) }
  const first = createObservedCompiler(options)
  const second = createObservedCompiler(options)
  try {
    await render(first)
    await render(second)
    await render(first)
    await render(second)
    assert.deepEqual(hits, [false, false, true, true], '同配置实例各自缓存，active watch 必须持续命中')
    assert.notEqual(first.references.roots[0].deref(), second.references.roots[0].deref())
    const closing = first.compiler.dispose()
    assert.equal(first.compiler.dispose(), closing, '重复关闭复用同一个完成结果')
    await closing
    await collect()
    assertReleased(first.references)
    assert.notEqual(second.references.roots[0].deref(), undefined, '关闭其他实例不能释放活动缓存')
    hits.length = 0
    await second.compiler.remove('styles')
    await render(second)
    assert.deepEqual(hits, [true], '移除来源不会释放活动实例的转换缓存')
    await first.compiler.remove('absent')
    assert.throws(() => first.compiler.transformCss('', first.snapshot), /已释放/)
  }
  finally {
    await Promise.all([first.compiler.dispose(), second.compiler.dispose()])
  }
  await collect()
  assertReleased(second.references)
  // 最后仍访问 Compiler，防止测试意外通过丢弃整个宿主实例完成回收。
  assert.throws(() => second.compiler.transformCss('', second.snapshot), /已释放/)
}

async function pendingTransformDrain() {
  const gate = { entered: deferred(), released: deferred() }
  const instance = createObservedCompiler({ cssPreflight: false }, gate)
  const pending = render(instance)
  await gate.entered.promise
  let closed = false
  const closing = instance.compiler.dispose()
  void closing.then(() => {
    closed = true
  })
  try {
    await collect()
    assert.equal(closed, false, '在途转换结束前不能释放服务')
    assert.notEqual(instance.references.roots[0].deref(), undefined)
    assert.throws(() => instance.compiler.transformCss('', instance.snapshot), /正在释放/)
  }
  finally {
    gate.released.resolve()
    await Promise.all([pending, closing])
  }
  await collect()
  assertReleased(instance.references)
  assert.throws(() => instance.compiler.transformCss('', instance.snapshot), /已释放/)
}

async function failedRootCleanup() {
  const instance = createObservedCompiler({ cssPreflight: false })
  await render(instance)
  const dispose = CompilerRootStore.prototype.dispose
  CompilerRootStore.prototype.dispose = async () => {
    throw new Error('root cleanup failed')
  }
  let closing
  try {
    closing = instance.compiler.dispose()
    await assert.rejects(closing, /root cleanup failed/)
    assert.equal(instance.compiler.dispose(), closing, '失败的关闭也必须保留同一完成结果')
  }
  finally {
    CompilerRootStore.prototype.dispose = dispose
  }
  await collect()
  assertReleased(instance.references)
  assert.throws(() => instance.compiler.transformCss('', instance.snapshot), /已释放/)
}

async function main() {
  const failures = []
  for (const [name, run] of [
    ['independent cached transforms', independentCachedTransforms],
    ['pending transform drain', pendingTransformDrain],
    ['failed root cleanup', failedRootCleanup],
  ]) {
    try {
      await run()
      process.stdout.write(`PASS ${name}\n`)
    }
    catch (error) {
      failures.push(error)
      process.stderr.write(`FAIL ${name}: ${error.stack ?? error}\n`)
    }
  }
  if (failures.length) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
