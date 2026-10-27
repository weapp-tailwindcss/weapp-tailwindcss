import assert from 'node:assert/strict'
import { AsyncResource } from 'node:async_hooks'
import process from 'node:process'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { runCompilerOwnerActivity } from '../../../src/compiler/compiler-owner-state.ts'

async function collect() {
  for (let attempt = 0; attempt < 8; attempt++) {
    await nextTurn()
    globalThis.gc()
  }
  await nextTurn()
}

// 保留最后一轮的异步上下文，模拟仍被构建器持有的 watch 回调。
function createContinuation() {
  return AsyncResource.bind(() => undefined)
}

async function retainCompletedChain() {
  const owners = []
  let continuation
  let completed = 0
  await new Promise((resolve, reject) => {
    function next() {
      if (completed === 1024) {
        continuation = createContinuation()
        resolve()
        return
      }
      const owner = { completed }
      owners.push(new WeakRef(owner))
      void runCompilerOwnerActivity(owner, () => {
        setImmediate(next)
      }).then(() => completed++, reject)
    }
    next()
  })
  await collect()
  assert.equal(
    owners.filter(owner => owner.deref() !== undefined).length,
    0,
    '仍存活的异步后续回调不能保留已完成的编译实例',
  )
  continuation()
}

function startPendingActivity() {
  const owner = {}
  const reference = new WeakRef(owner)
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const pending = runCompilerOwnerActivity(owner, () => gate)
  return { reference, pending, release }
}

async function main() {
  await retainCompletedChain()
  const activity = startPendingActivity()
  await collect()
  assert.notEqual(activity.reference.deref(), undefined, '执行中的任务必须持有编译实例')
  activity.release()
  await activity.pending
  await collect()
  assert.equal(activity.reference.deref(), undefined, '任务完成后应释放编译实例引用')
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
