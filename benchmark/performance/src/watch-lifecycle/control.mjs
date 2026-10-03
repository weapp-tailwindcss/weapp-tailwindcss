/** 记录本轮 watcher 状态；取消与超时都携带首次失败阶段。 */
export function createWatchControl(kind, signal, directory) {
  let phase = 'startup'
  let completed = 0
  let css = ''
  let failure
  let waiting
  const snapshot = () => ({ kind, phase, completed, colors: [...new Set(css.match(/#[0-9a-f]{6}/gi) ?? [])], ...(directory ? { directory } : {}) })
  const contextualize = (message, cause) => {
    const state = snapshot()
    return Object.assign(new Error(`${kind} watch ${message} at ${phase} after build ${completed}; colors=${state.colors.join(',')}${directory ? `; workspace=${directory}` : ''}`, { cause }), { watchState: state })
  }
  const assertActive = () => {
    if (signal?.aborted) {
      throw contextualize('cancelled', signal.reason)
    }
  }

  return {
    snapshot,
    contextualize,
    assertActive,
    get css() { return css },
    set css(value) { css = value },
    get completed() { return completed },
    setPhase(value) {
      assertActive()
      phase = value
    },
    notify(error) {
      completed++
      failure ??= error
      waiting?.()
    },
    nextBuild(previous) {
      return new Promise((resolve, reject) => {
        let timer
        let check
        const finish = (error) => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', check)
          waiting = undefined
          if (error) {
            reject(error)
          }
          else {
            resolve()
          }
        }
        check = () => {
          if (signal?.aborted) {
            finish(contextualize('cancelled', signal.reason))
          }
          else if (failure) {
            finish(contextualize('build failed', failure))
          }
          else if (completed > previous) {
            finish()
          }
        }
        timer = setTimeout(() => finish(contextualize('timed out')), 15_000)
        waiting = check
        signal?.addEventListener('abort', check, { once: true })
        check()
      })
    },
  }
}

/** 清理按资源归属逐项执行，某项失败不阻止后续资源关闭。 */
export async function closeWatchResources(actions) {
  const errors = []
  for (const action of actions) {
    try {
      await action()
    }
    catch (error) {
      errors.push(error)
    }
  }
  if (errors.length === 1) {
    throw errors[0]
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, 'watcher 资源关闭失败。')
  }
}

/** 测量 Promise 仅在清理完成后结束；同时失败时保留两处异常。 */
export async function runWatchOperation(control, action, cleanup) {
  let result
  try {
    control.assertActive()
    result = { passed: true, value: await action() }
  }
  catch (error) {
    result = { passed: false, error: error?.watchState ? error : control.contextualize('failed', error) }
  }
  try {
    await cleanup()
  }
  catch (error) {
    const cleanupError = control.contextualize('cleanup failed', error)
    if (!result.passed) {
      throw new AggregateError([result.error, cleanupError], `${result.error.message}; watcher 收尾也失败。`, { cause: result.error })
    }
    throw cleanupError
  }
  if (!result.passed) {
    throw result.error
  }
  control.assertActive()
  return result.value
}
