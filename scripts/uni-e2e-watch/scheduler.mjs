import { hasSnapshotChanged } from './source-snapshot.mjs'

export function createPollingBuildScheduler({ collectSnapshot, runBuild, onState, isStopping }) {
  let lastSnapshot
  let inFlight
  let generation = 0

  const cycle = async () => {
    let next = await collectSnapshot()
    if (isStopping() || (lastSnapshot && !hasSnapshotChanged(lastSnapshot, next))) {
      return
    }
    do {
      if (isStopping()) {
        return
      }
      const before = next
      generation += 1
      onState({ generation, status: 'start' })
      await runBuild()
      next = await collectSnapshot()
      if (!hasSnapshotChanged(before, next)) {
        break
      }
    } while (!isStopping())
    if (!isStopping()) {
      lastSnapshot = next
      // 仅在子进程退出且源码快照稳定后声明 idle，DONE 日志不能代替这个边界。
      onState({ generation, status: 'idle' })
    }
  }

  return {
    poll() {
      // 启动构建、轮询和构建后快照共用单飞生命周期，禁止并发快照覆盖状态。
      if (!inFlight) {
        inFlight = cycle().finally(() => {
          inFlight = undefined
        })
      }
      return inFlight
    },
  }
}
