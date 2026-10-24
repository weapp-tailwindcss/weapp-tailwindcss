import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import process from 'node:process'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { createStyleHandler } from '@weapp-tailwindcss/postcss/transform'
import Vinyl from 'vinyl'
import { createPlugins } from '../../../src/bundlers/gulp/index.ts'
import { createGulpFileTransforms } from '../../../src/bundlers/gulp/shared/create-native-framework-plugins/file-transforms.ts'
import { createGulpPluginFacade } from '../../../src/bundlers/gulp/shared/plugin-session.ts'
import { createCache } from '../../../src/cache/index.ts'
import { disposeCompilerOwner } from '../../../src/compiler/owner-lifecycle.ts'

async function collect() {
  for (let attempt = 0; attempt < 8; attempt++) {
    await nextTurn()
    globalThis.gc()
  }
  await nextTurn()
}

function observer() {
  const references = []
  return {
    references,
    observe(label, value) {
      references.push({ label, value: new WeakRef(value) })
      return value
    },
  }
}

async function render(stream) {
  stream.resume()
  await new Promise((resolve, reject) => stream.write(new Vinyl({
    cwd: process.cwd(),
    base: process.cwd(),
    path: path.resolve('styles.css'),
    contents: Buffer.from('.p-4 { padding: 1rem }'),
  }), error => error ? reject(error) : resolve()))
}

function cleanupError() {
  const failure = new Error('cleanup failed')
  const cause = new Error('nested cause', { cause: failure })
  failure.cause = cause
  return new AggregateError([new AggregateError([failure], 'inner cleanup')], 'outer cleanup', { cause })
}

async function close(plugins, fails) {
  const closed = plugins.dispose()
  assert.equal(plugins.dispose(), closed)
  // 不在测试中读取 stack；失败诊断的物化必须发生在生产释放边界。
  if (fails) {
    await assert.rejects(closed)
  }
  else { await closed }
  return { closed }
}

async function exercisePublic(fails, sharedCache = false) {
  const { references, observe } = observer()
  const resource = observe('extension-resource', {})
  const cache = sharedCache ? observe('external-cache', createCache()) : undefined
  cache?.set('caller-entry', resource)
  const plugin = {
    postcssPlugin: 'observe-gulp-owned-transform',
    Once(root) {
      assert.ok(resource)
      observe('real-css-root', root)
    },
  }
  const matcher = observe('configuration-callback', () => Boolean(resource))
  observe('style-plugin-callback', plugin.Once)
  const reset = observe('extension-cleanup', () => {
    assert.ok(resource)
    if (fails) {
      throw cleanupError()
    }
  })
  const plugins = createPlugins({
    logLevel: 'silent',
    cssPreflight: false,
    mainCssChunkMatcher: matcher,
    postcssOptions: { plugins: [plugin] },
    cache,
    __internalGulpRuntimeClassSetManager: { reset },
  })
  const stream = plugins.adaptWxss()
  const downstream = plugins.adaptWxss()
  stream.pipe(downstream).resume()
  await render(stream)
  assert.ok(references.some(reference => reference.label === 'real-css-root'))
  const { closed } = await close(plugins, fails)
  if (cache) {
    assert.equal(cache.get('caller-entry'), resource, '释放实例不能清除调用者缓存中的内容')
  }
  return { plugins, stream, downstream, closed, references }
}

async function exerciseServices(fails) {
  const { references, observe } = observer()
  const cache = observe('transform-cache', createCache())
  const runtimeState = observe('compiler-owner', { tailwindRuntime: { majorVersion: 3 }, readyPromise: Promise.resolve() })
  const actual = observe('real-style-handler', createStyleHandler({ cssPreflight: false }))
  const styleHandler = observe('style-handler', async (...args) => {
    const result = await actual(...args)
    observe('real-cached-css-root', result.root)
    return result
  })
  const opts = observe('resolved-context', { styleHandler })
  const context = observe('transform-services', {
    opts,
    cache,
    runtimeState,
    debug() {},
    generatedCssPreflightModeByFile: new Map(),
    resolveGulpStyleOutputExtension: () => '.css',
    resolveWxssFileHandlerOptions: () => ({ isMainChunk: false }),
    resolveGulpTransformTimingDetails: () => ({}),
  })
  const { release, ...transforms } = createGulpFileTransforms(context)
  const plugins = createGulpPluginFacade({
    ...transforms,
    dispose: () => disposeCompilerOwner(runtimeState, {
      beforeDispose() {
        cache.instance.clear()
        cache.hashMap.clear()
        release()
        if (fails) {
          throw cleanupError()
        }
      },
    }),
  })
  const stream = plugins.adaptWxss()
  const downstream = plugins.adaptWxss()
  stream.pipe(downstream).resume()
  await render(stream)
  const { closed } = await close(plugins, fails)
  return { plugins, stream, downstream, closed, references }
}

async function main() {
  for (const [label, exercise] of [
    ['public Gulp', exercisePublic],
    ['public shared-cache Gulp', fails => exercisePublic(fails, true)],
    ['transform services', exerciseServices],
  ]) {
    for (const fails of [false, true]) {
      const instance = await exercise(fails)
      await collect()
      const retained = instance.references.filter(reference => reference.value.deref()).map(reference => reference.label)
      assert.deepEqual(retained, [], `${label} 关闭不能保留上下文、handler、真实样式树或扩展资源：fails=${fails}`)
      assert.equal(instance.plugins.dispose(), instance.closed)
      assert.throws(() => instance.plugins.adaptWxss(), /已释放/)
      assert.ok(instance.stream.writable && instance.downstream.writable, '宿主仍保留同一对尚未结束的 pipe stream')
      instance.stream.end()
      process.stdout.write(`PASS ${label} ${fails ? 'failed' : 'successful'} close\n`)
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
