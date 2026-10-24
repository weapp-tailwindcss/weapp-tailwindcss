import assert from 'node:assert/strict'
import process from 'node:process'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { WeappTailwindcss } from '../../../src/bundlers/webpack/BaseUnifiedPlugin/v5.ts'

function createCompiler() {
  const callbacks = {}
  const hook = name => ({
    tap(_name, callback) {
      (callbacks[name] ??= []).push(callback)
    },
  })
  return {
    callbacks,
    options: {},
    getInfrastructureLogger: () => ({ error() {} }),
    hooks: Object.fromEntries(['invalid', 'watchRun', 'thisCompilation', 'compilation', 'watchClose', 'shutdown', 'afterEnvironment'].map(name => [name, hook(name)])),
    webpack: { Compilation: { PROCESS_ASSETS_STAGE_SUMMARIZE: 1000 }, sources: {} },
  }
}

// 源码 fixture 补齐正式打包产物提供的 __dirname；本用例只登记 loader，不执行构建。
globalThis.__dirname = fileURLToPath(new URL('../../../src/bundlers/webpack/BaseUnifiedPlugin/', import.meta.url))

async function exercise(failCleanup) {
  const plugin = new WeappTailwindcss({ logLevel: 'silent', runtimeLoaderPath: fileURLToPath(new URL('./unused-loader.cjs', import.meta.url)) })
  const context = plugin.options
  const references = ['styleHandler', 'jsHandler', 'templateHandler', 'tailwindRuntime'].map(key => ({ label: key, value: new WeakRef(context[key]) }))
  const payload = { source: () => 'cached output' }
  references.push({ label: 'cache-payload', value: new WeakRef(payload) })
  context.cache.set('asset', payload)
  if (failCleanup) {
    context.cache.instance.clear = function failingClear() {
      const failure = new Error('cache clear failed')
      const cause = new Error('nested cause', { cause: failure })
      failure.cause = cause
      throw new AggregateError([failure], 'nested cache failure', { cause })
    }
  }
  const compiler = createCompiler()
  plugin.apply(compiler)
  const closed = compiler.callbacks.watchClose[0]()
  if (failCleanup) {
    await assert.rejects(closed, /上下文释放失败/)
  }
  else {
    await closed
  }
  return { plugin, compiler, closed, references }
}

async function main() {
  for (const failCleanup of [false, true]) {
    const instance = await exercise(failCleanup)
    for (let attempt = 0; attempt < 8; attempt++) {
      await nextTurn()
      globalThis.gc()
    }
    await nextTurn()
    assert.deepEqual(instance.references.filter(reference => reference.value.deref() !== undefined).map(reference => reference.label), [], `永久关闭仍保留旧 handler、runtime 或缓存产物：cleanupFailure=${failCleanup}`)
    assert.equal(instance.compiler.callbacks.watchClose[0](), instance.closed)
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
