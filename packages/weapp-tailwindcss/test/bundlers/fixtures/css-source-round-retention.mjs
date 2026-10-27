import assert from 'node:assert/strict'
import process from 'node:process'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { createViteCssSourceLifecycle } from '../../../src/bundlers/vite/css-memory/source-lifecycle.ts'
import { createViteCssSourceTaskScope } from '../../../src/bundlers/vite/css-memory/source-task-scope.ts'

function createProvider(resource, cleanupFails) {
  const lifecycle = createViteCssSourceLifecycle()
  return (file) => {
    assert.ok(resource)
    const lease = lifecycle.capture(file)
    return Object.assign(() => lease(), {
      release() {
        assert.ok(resource)
        lease.release()
        if (cleanupFails) {
          throw new Error('source cleanup failed')
        }
      },
    })
  }
}

function receiveCapture(host) {
  return async (capture) => {
    host.capture = capture
    assert.equal(capture('/repo/source.css')(), true)
  }
}

function startRound(cleanupFails) {
  const resource = {}
  const reference = new WeakRef(resource)
  const scope = createViteCssSourceTaskScope(createProvider(resource, cleanupFails))
  const host = {}
  host.closed = scope.run(receiveCapture(host))
  return { reference, host }
}

async function main() {
  for (const cleanupFails of [false, true]) {
    const { reference, host } = startRound(cleanupFails)
    if (cleanupFails) {
      // 不读取 stack，避免测试提前消除错误调用帧的真实保留链。
      await host.closed.catch(() => {})
    }
    else {
      await host.closed
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      await nextTurn()
      globalThis.gc()
    }
    await nextTurn()
    assert.equal(reference.deref(), undefined, `宿主保留已关闭轮次服务时，不能继续保留来源 provider 的私有资源：cleanupFails=${cleanupFails}`)
    const late = host.capture('/repo/late.css')
    assert.equal(late(), false)
    late.release()
    late.release()
    assert.equal(late(), false)
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
