import type { ViteBuildEvent, ViteBuildWatcher } from './vite-watch-session'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createViteWatchSession, joinViteWatchCleanup } from './vite-watch-session'

function createWatcher(close: () => Promise<void> = async () => {}) {
  const events = new EventEmitter()
  const closeWatcher = vi.fn(close)
  const watcher: ViteBuildWatcher = {
    close: closeWatcher,
    on(event, listener) { events.on(event, listener) },
    off(event, listener) { events.off(event, listener) },
  }
  const emit = (event: ViteBuildEvent) => events.emit('event', event)
  return { watcher, events, emit, close: closeWatcher }
}

describe('Vite HMR 测试会话归属与取消', () => {
  it('取消已发出的启动后仍接管迟到 watcher，关闭完成前不清理夹具', async () => {
    const controller = new AbortController()
    const session = createViteWatchSession(controller.signal)
    const opening = Promise.withResolvers<ViteBuildWatcher>()
    const opened = Promise.withResolvers<void>()
    const closing = Promise.withResolvers<void>()
    const closeEntered = Promise.withResolvers<void>()
    const fixture = createWatcher(async () => {
      closeEntered.resolve()
      await closing.promise
    })
    const pending = session.start(() => {
      opened.resolve()
      return opening.promise
    })
    const outcome = pending.catch(error => error)
    await opened.promise
    const reason = new Error('当前测试取消')
    controller.abort(reason)
    const cleanup = vi.fn(async () => {})
    const joined = joinViteWatchCleanup([pending], [session.close], cleanup)
    await Promise.resolve()
    expect(fixture.close).not.toHaveBeenCalled()
    expect(cleanup).not.toHaveBeenCalled()

    opening.resolve(fixture.watcher)
    await closeEntered.promise
    expect(await outcome).toBe(reason)
    expect(fixture.close).toHaveBeenCalledOnce()
    expect(cleanup).not.toHaveBeenCalled()
    closing.resolve()
    await joined
    await session.close()
    expect(fixture.close).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('取消在途重建等待后先排空关闭，任务与夹具清理均不得抢先', async () => {
    const controller = new AbortController()
    const session = createViteWatchSession(controller.signal)
    const buildFinished = Promise.withResolvers<void>()
    const closeEntered = Promise.withResolvers<void>()
    const order: string[] = []
    const fixture = createWatcher(async () => {
      order.push('close:start')
      closeEntered.resolve()
      await buildFinished.promise
      order.push('close:end')
    })
    await session.start(async () => fixture.watcher)
    const operation = (async () => {
      try {
        await session.waitForEnd()
      }
      finally {
        await session.close()
        order.push('operation:end')
      }
    })()
    const outcome = operation.catch(error => error)
    const cleanup = vi.fn(async () => {
      order.push('fixture:remove')
    })
    const joined = joinViteWatchCleanup([operation], [session.close], cleanup)
    const reason = new Error('在途重建取消')
    controller.abort(reason)
    await closeEntered.promise
    expect(fixture.events.listenerCount('event')).toBe(0)
    expect(order).toEqual(['close:start'])
    expect(cleanup).not.toHaveBeenCalled()

    fixture.emit({ code: 'END' })
    buildFinished.resolve()
    await joined
    expect(await outcome).toBe(reason)
    expect(fixture.close).toHaveBeenCalledOnce()
    expect(order).toEqual(['close:start', 'close:end', 'operation:end', 'fixture:remove'])
  })

  it('取消移除全部等待者，迟到 END 不能复活旧会话或满足新会话', async () => {
    const controller = new AbortController()
    const session = createViteWatchSession(controller.signal)
    const fixture = createWatcher()
    await session.start(async () => fixture.watcher)
    const waits = [session.waitForEnd(), session.waitForEnd()]
    const outcomes = waits.map(pending => pending.catch(error => error))
    expect(fixture.events.listenerCount('event')).toBe(2)
    const reason = new Error('本轮已结束')
    controller.abort(reason)
    expect(await Promise.all(outcomes)).toEqual([reason, reason])
    expect(fixture.events.listenerCount('event')).toBe(0)
    fixture.emit({ code: 'END' })
    await expect(session.waitForEnd()).rejects.toBe(reason)
    await session.close()

    const nextController = new AbortController()
    const nextSession = createViteWatchSession(nextController.signal)
    const nextFixture = createWatcher()
    await nextSession.start(async () => nextFixture.watcher)
    let completed = false
    const nextWait = nextSession.waitForEnd().then(() => {
      completed = true
    })
    fixture.emit({ code: 'END' })
    await Promise.resolve()
    expect(completed).toBe(false)
    nextFixture.emit({ code: 'END' })
    await nextWait
    await nextSession.close()
    expect(nextFixture.events.listenerCount('event')).toBe(0)
    expect(fixture.close).toHaveBeenCalledOnce()
    expect(nextFixture.close).toHaveBeenCalledOnce()
  })

  it.each(['END', 'ERROR'] as const)('%s 结束等待后移除监听，保留原错误', async (code) => {
    const controller = new AbortController()
    const session = createViteWatchSession(controller.signal)
    const fixture = createWatcher()
    await session.start(async () => fixture.watcher)
    const pending = session.waitForEnd()
    const reason = new Error('真实构建错误')
    fixture.emit({ code, error: reason })
    if (code === 'ERROR') {
      await expect(pending).rejects.toBe(reason)
    }
    else {
      await pending
    }
    expect(fixture.events.listenerCount('event')).toBe(0)
    await Promise.all([session.close(), session.close()])
    expect(fixture.close).toHaveBeenCalledOnce()
  })

  it('关闭失败必须阻断夹具删除，并保留关闭错误', async () => {
    const controller = new AbortController()
    const session = createViteWatchSession(controller.signal)
    const reason = new Error('关闭失败')
    const fixture = createWatcher(async () => {
      throw reason
    })
    await session.start(async () => fixture.watcher)
    const operation = session.waitForEnd().finally(session.close)
    void operation.catch(() => {})
    const cleanup = vi.fn(async () => {})
    const joined = joinViteWatchCleanup([operation], [session.close], cleanup)
    controller.abort(new Error('取消'))
    await expect(joined).rejects.toMatchObject({ errors: [reason] })
    expect(fixture.close).toHaveBeenCalledOnce()
    expect(cleanup).not.toHaveBeenCalled()
    expect(fixture.events.listenerCount('event')).toBe(0)
  })
})
