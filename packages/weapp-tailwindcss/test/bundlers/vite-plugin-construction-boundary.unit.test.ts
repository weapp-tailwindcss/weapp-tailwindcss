import type { Plugin, ResolvedConfig } from 'vite'
import type { VitePluginSlot } from '@/bundlers/vite/shared/plugin-slots'
import { describe, expect, it } from 'vitest'
import { createVitePluginConstruction } from '@/bundlers/vite/shared/plugin-construction'
import { createDeferredVitePlugins } from '@/bundlers/vite/shared/plugin-slots'

const slot = { name: 'owner', ownsSession: true, hooks: { closeWatcher: { order: 'post', sequential: true } } } satisfies VitePluginSlot

function call(plugin: Plugin, name: keyof Plugin, ...args: unknown[]) {
  const hook = plugin[name]
  const handler = typeof hook === 'function' ? hook : hook && typeof hook === 'object' && 'handler' in hook ? hook.handler : undefined
  return typeof handler === 'function' ? Reflect.apply(handler, {}, args) : undefined
}

const config = () => ({ command: 'build', build: { watch: {} } }) as ResolvedConfig

describe('同步工厂失败交给配置初始化边界等待', () => {
  it('等待回滚后报告原错误，同配置重复初始化和关闭复用同一失败结果', async () => {
    const events: string[] = []
    const gate = Promise.withResolvers<void>()
    const failure = new Error('construction failed')
    let attempts = 0
    const [plugin] = createDeferredVitePlugins([slot], () => {
      attempts++
      const construction = createVitePluginConstruction()
      return construction.run(() => {
        construction.addCleanup(async () => {
          events.push('drain')
          await gate.promise
          events.push('disposed')
        }, 0)
        throw failure
      })
    })
    const resolved = config()
    const failed = call(plugin!, 'configResolved', resolved)
    const expectation = expect(failed).rejects.toBe(failure)
    expect(call(plugin!, 'configResolved', resolved)).toBe(failed)
    expect(call(plugin!, 'closeWatcher')).toBe(failed)
    await Promise.resolve()
    expect(events).toEqual(['drain'])
    expect(attempts).toBe(1)
    gate.resolve()
    await expectation
    expect(events).toEqual(['drain', 'disposed'])
    expect(call(plugin!, 'configResolved', resolved)).toBe(failed)
    expect(call(plugin!, 'closeWatcher')).toBe(failed)
    const next = call(plugin!, 'configResolved', config())
    await expect(next).rejects.toBe(failure)
    expect(next).not.toBe(failed)
    expect(attempts).toBe(2)
  })

  it('回滚部分失败仍等待其余清理，保留构造错误和清理错误', async () => {
    const failure = new Error('construction failed')
    const cleanupFailure = new Error('cleanup failed')
    const events: string[] = []
    const [plugin] = createDeferredVitePlugins([slot], () => {
      const construction = createVitePluginConstruction()
      return construction.run(() => {
        construction.addCleanup(() => {
          events.push('first')
          throw cleanupFailure
        }, 0)
        construction.addCleanup(() => {
          events.push('last')
        }, 1)
        throw failure
      })
    })
    const failed = call(plugin!, 'configResolved', config())
    await expect(failed).rejects.toMatchObject({ errors: [failure, cleanupFailure] })
    expect(events).toEqual(['first', 'last'])
    expect(call(plugin!, 'closeWatcher')).toBe(failed)
  })

  it('未使用资源事务的同步工厂失败也不能在同配置中隐式重建', async () => {
    const failure = new Error('plain factory failed')
    let attempts = 0
    const [plugin] = createDeferredVitePlugins([slot], () => {
      attempts++
      throw failure
    })
    const resolved = config()
    const failed = call(plugin!, 'configResolved', resolved)
    await expect(failed).rejects.toBe(failure)
    expect(call(plugin!, 'configResolved', resolved)).toBe(failed)
    expect(call(plugin!, 'closeWatcher')).toBe(failed)
    expect(attempts).toBe(1)
  })
})
