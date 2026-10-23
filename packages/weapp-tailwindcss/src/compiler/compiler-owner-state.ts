import { AsyncLocalStorage } from 'node:async_hooks'

type OwnerPhase = 'active' | 'closing' | 'closed'
interface OwnerState {
  phase: OwnerPhase
  active: number
  idleWaiters: Set<() => void>
  disposal?: Promise<void>
}
interface ActivityLease { owner: object | undefined, active: boolean }
const ownerStates = new WeakMap<object, OwnerState>()
const activities = new AsyncLocalStorage<readonly ActivityLease[]>()

function getState(owner: object) {
  let state = ownerStates.get(owner)
  if (!state) {
    state = { phase: 'active', active: 0, idleWaiters: new Set() }
    ownerStates.set(owner, state)
  }
  return state
}

export function ensureCompilerOwnerActive(owner: object) {
  const state = getState(owner)
  const accepted = activities.getStore()?.some(lease => lease.owner === owner && lease.active)
  if (state.phase === 'closed' || (state.phase === 'closing' && !accepted)) {
    throw new Error(state.phase === 'closed'
      ? 'Compiler owner 已释放，不能创建新的编译状态。'
      : 'Compiler owner 正在释放，不能接收新的编译任务。')
  }
}

export function runCompilerOwnerActivity<T>(owner: object, activity: () => T | Promise<T>): Promise<Awaited<T>> {
  try {
    ensureCompilerOwnerActive(owner)
  }
  catch (error) {
    return Promise.reject(error)
  }
  const state = getState(owner)
  const lease: ActivityLease = { owner, active: true }
  state.active++
  const release = () => {
    lease.active = false
    // 异步后续任务可能继续持有租约；任务完成后不再通过租约保留整个编译实例。
    lease.owner = undefined
    state.active--
    if (state.active === 0) {
      for (const resolve of state.idleWaiters) {
        resolve()
      }
      state.idleWaiters.clear()
    }
  }
  try {
    // 已接收任务可以完成其嵌套工作；关闭开始后的外部调用不能借用此租约。
    const activeLeases = activities.getStore()?.filter(activity => activity.active) ?? []
    activeLeases.push(lease)
    return activities.run(activeLeases, () => Promise.resolve(activity()).finally(release))
  }
  catch (error) {
    release()
    return Promise.reject(error)
  }
}

export function runCompilerOwnerDisposal(owner: object, dispose: () => Promise<void>): Promise<void> {
  const state = getState(owner)
  if (state.disposal) {
    return state.disposal
  }
  state.phase = 'closing'
  state.disposal = Promise.resolve().then(async () => {
    if (state.active > 0) {
      await new Promise<void>(resolve => state.idleWaiters.add(resolve))
    }
    await dispose()
  }).finally(() => {
    state.phase = 'closed'
  })
  return state.disposal
}
