const compilerOwnerDisposals = new WeakMap<object, Promise<void>>()
const compilerOwnerActivities = new WeakMap<object, {
  active: number
  idleWaiters: Set<() => void>
}>()
type CompilerOwnerActivityRelease = () => void

export function ensureCompilerOwnerActive(owner: object) {
  if (compilerOwnerDisposals.has(owner)) {
    throw new Error('Compiler owner 正在释放，不能创建新的编译状态。')
  }
}

function acquireCompilerOwnerActivity(
  owner: object,
): CompilerOwnerActivityRelease | Promise<CompilerOwnerActivityRelease> {
  const currentDisposal = compilerOwnerDisposals.get(owner)
  if (currentDisposal) {
    return currentDisposal.then(() => acquireCompilerOwnerActivity(owner))
  }

  let state = compilerOwnerActivities.get(owner)
  if (!state) {
    state = {
      active: 0,
      idleWaiters: new Set(),
    }
    compilerOwnerActivities.set(owner, state)
  }
  state.active += 1

  let released = false
  return () => {
    if (released) {
      return
    }
    released = true
    state.active -= 1
    if (state.active > 0) {
      return
    }
    compilerOwnerActivities.delete(owner)
    for (const resolve of state.idleWaiters) {
      resolve()
    }
    state.idleWaiters.clear()
  }
}

function waitForCompilerOwnerIdle(owner: object) {
  const state = compilerOwnerActivities.get(owner)
  if (!state || state.active === 0) {
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    state.idleWaiters.add(resolve)
  })
}

export function runCompilerOwnerActivity<T>(
  owner: object,
  activity: () => T | Promise<T>,
): Promise<Awaited<T>> {
  const acquired = acquireCompilerOwnerActivity(owner)
  if (typeof acquired !== 'function') {
    return acquired.then(release => runCompilerOwnerActivityWithRelease(activity, release))
  }
  return runCompilerOwnerActivityWithRelease(activity, acquired)
}

function runCompilerOwnerActivityWithRelease<T>(
  activity: () => T | Promise<T>,
  release: CompilerOwnerActivityRelease,
): Promise<Awaited<T>> {
  try {
    return Promise.resolve(activity()).finally(release)
  }
  catch (error) {
    release()
    return Promise.reject(error)
  }
}

export function runCompilerOwnerDisposal(
  owner: object,
  dispose: () => Promise<void>,
) {
  const currentDisposal = compilerOwnerDisposals.get(owner)
  if (currentDisposal) {
    return currentDisposal
  }
  const disposal = Promise.resolve().then(async () => {
    await waitForCompilerOwnerIdle(owner)
    await dispose()
  }).finally(() => {
    if (compilerOwnerDisposals.get(owner) === disposal) {
      compilerOwnerDisposals.delete(owner)
    }
  })
  compilerOwnerDisposals.set(owner, disposal)
  return disposal
}
