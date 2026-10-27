import assert from 'node:assert/strict'
import process from 'node:process'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { disposeCompilationProfileCache, resolveCachedCompilationProfile } from '../../../src/compiler/compilation-profile-cache.ts'
import { runCompilerOwnerDisposal } from '../../../src/compiler/compiler-owner-state.ts'

async function collect() {
  for (let attempt = 0; attempt < 8; attempt++) {
    await nextTurn()
    globalThis.gc()
  }
  await nextTurn()
}

function retainOwner() {
  const owner = {}
  const provider = { revision: 1 }
  const callback = () => provider.revision
  const { isCurrent } = resolveCachedCompilationProfile(owner, 'same', {}, revision => ({
    revision,
    styleOptions: { callback },
  }))
  return { owner, isCurrent, callback: new WeakRef(callback), provider: new WeakRef(provider) }
}

async function main() {
  // 模拟宿主长期保留插件 owner 和旧请求的版本查询函数。
  const retained = retainOwner()
  await collect()
  assert.notEqual(retained.callback.deref(), undefined, '活动配置必须持有回调')
  assert.notEqual(retained.provider.deref(), undefined, '活动配置必须持有回调的 provider')
  await runCompilerOwnerDisposal(retained.owner, async () => disposeCompilationProfileCache(retained.owner))
  await collect()
  assert.equal(retained.isCurrent(), false, '关闭后旧版本查询失效')
  assert.equal(retained.callback.deref(), undefined, '宿主持有关闭的 owner 时仍应回收配置回调')
  assert.equal(retained.provider.deref(), undefined, '配置回调不应在关闭后保留 provider')
  assert.throws(() => resolveCachedCompilationProfile(retained.owner, 'same', {}, () => ({})), /已释放/u)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
