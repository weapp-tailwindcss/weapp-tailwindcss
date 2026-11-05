import { expect, it, vi } from 'vitest'
import { createNativeStartupOwner } from './react-native/startup-owner'
import { awaitNativeStartupResource } from './react-native/startup-resource'

it('取消后晚到的资源由原操作关闭，owner 在真实关闭前保持 pending', async () => {
  const parent = new AbortController()
  const owner = createNativeStartupOwner({ parentSignal: parent.signal })
  let opened!: (value: object) => void
  let closed!: () => void
  const resource = {}
  const close = vi.fn(() => new Promise<void>((resolve) => {
    closed = resolve
  }))
  const started = owner.run('late-resource', signal => awaitNativeStartupResource(() => new Promise<object>((resolve) => {
    opened = resolve
  }), signal, close)).catch(error => error)
  try {
    await Promise.resolve()
    await Promise.resolve()
    const reason = new Error('startup cancelled')
    parent.abort(reason)
    expect(await started).toBe(reason)
    expect(owner.pending()).toBe(true)
    opened(resource)
    await Promise.resolve()
    await Promise.resolve()
    expect(close).toHaveBeenCalledWith(resource)
    expect(owner.pending()).toBe(true)
    closed()
    await expect(owner.drain()).rejects.toBe(reason)
    expect(owner.pending()).toBe(false)
  }
  finally {
    closed?.()
    owner.release()
  }
})

it('资源关闭失败与原始取消一起保留，不接受该资源', async () => {
  const controller = new AbortController()
  const reason = new Error('startup cancelled')
  const cleanup = new Error('resource close failed')
  const operation = async () => {
    controller.abort(reason)
    return {}
  }
  const failure = await awaitNativeStartupResource(operation, controller.signal, async () => {
    throw cleanup
  }).catch(error => error)
  expect(failure).toBeInstanceOf(AggregateError)
  expect(failure.errors).toEqual([reason, cleanup])
})

it('正常资源交付后交由主流程拥有，预先取消则不开始准备', async () => {
  const resource = {}
  const close = vi.fn()
  expect(await awaitNativeStartupResource(async () => resource, undefined, close)).toBe(resource)
  expect(close).not.toHaveBeenCalled()
  const controller = new AbortController()
  controller.abort(new Error('cancelled'))
  const prepare = vi.fn(async () => resource)
  await expect(awaitNativeStartupResource(prepare, controller.signal, close)).rejects.toThrow('cancelled')
  expect(prepare).not.toHaveBeenCalled()
})
