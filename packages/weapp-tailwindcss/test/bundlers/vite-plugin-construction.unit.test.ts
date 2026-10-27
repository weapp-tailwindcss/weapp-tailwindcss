import { describe, expect, it } from 'vitest'
import { createVitePluginConstruction, registerConstructedVitePlugins, settleVitePluginConstructionFailure } from '@/bundlers/vite/shared/plugin-construction'

function captureFailure(create: () => unknown) {
  try {
    create()
  }
  catch (error) {
    return error
  }
  throw new Error('预期工厂构造失败')
}

describe('同步插件工厂的资源构造事务', () => {
  it('构造失败不启动后台任务，唯一接点等待回滚并保留原始错误身份', async () => {
    const construction = createVitePluginConstruction()
    const gate = Promise.withResolvers<void>()
    const events: string[] = []
    const failure = new Error('construction failed')
    construction.addCleanup(async () => {
      events.push('generation')
      await gate.promise
    }, 10)
    construction.addCleanup(() => {
      events.push('core')
    }, 90)
    const error = captureFailure(() => construction.run(() => {
      throw failure
    }))
    expect(events).toEqual([])
    const completion = settleVitePluginConstructionFailure(error)!
    expect(settleVitePluginConstructionFailure(error)).toBe(completion)
    const rejection = expect(completion).rejects.toBe(failure)
    await Promise.resolve()
    expect(events).toEqual(['generation'])
    gate.resolve()
    await rejection
    expect(events).toEqual(['generation', 'core'])
    await expect(completion).rejects.toBe(failure)
    expect(events).toEqual(['generation', 'core'])
  })

  it('已创建扩展先释放，部分失败仍释放剩余资源并报告全部原始错误', async () => {
    const construction = createVitePluginConstruction()
    const events: string[] = []
    const failure = new Error('factory failed')
    const extensionFailure = new Error('extension failed')
    const relationFailure = new Error('relation failed')
    construction.addCleanup(() => {
      events.push('core')
    }, 90)
    construction.addCleanup(() => {
      events.push('relations')
      throw relationFailure
    }, 40)
    registerConstructedVitePlugins(construction, [{
      name: 'partial-extension',
      closeWatcher: {
        handler() {
          expect(this).toBeUndefined()
          events.push('extension')
          throw extensionFailure
        },
      },
    }])
    const error = captureFailure(() => construction.run(() => {
      throw failure
    }))
    await expect(settleVitePluginConstructionFailure(error)).rejects.toMatchObject({ errors: [failure, extensionFailure, relationFailure] })
    expect(events).toEqual(['extension', 'relations', 'core'])
  })

  it('成功交付的扩展归宿主关闭，事务仅幂等释放自身资源', async () => {
    const construction = createVitePluginConstruction()
    const events: string[] = []
    const plugins = [{ name: 'extension', closeWatcher() {
      events.push('extension')
    } }]
    const result = construction.run(() => {
      construction.addCleanup(() => {
        events.push('core')
      }, 90)
      registerConstructedVitePlugins(construction, plugins)
      return plugins
    })
    expect(result).toBe(plugins)
    const closing = construction.dispose()
    expect(construction.dispose()).toBe(closing)
    await closing
    expect(events).toEqual(['core'])
  })

  it('框架直接调用的服务保持返回值，关闭先停止接收并排空已接受的任务', async () => {
    const construction = createVitePluginConstruction()
    const gate = Promise.withResolvers<void>()
    const events: string[] = []
    const failure = new Error('service failed')
    construction.run(() => construction.addCleanup(() => {
      events.push('core')
    }, 90))
    expect(construction.runTask(() => 42)).toBe(42)
    expect(() => construction.runTask(() => {
      throw failure
    })).toThrow(failure)
    expect(construction.runTask(() => gate.promise)).toBe(gate.promise)
    const closing = construction.dispose()
    expect(() => construction.runTask(() => undefined)).toThrow('不再接收')
    await Promise.resolve()
    expect(events).toEqual([])
    gate.resolve()
    await closing
    expect(events).toEqual(['core'])
  })

  it('保留非 Error 的原始失败值，普通错误由调用方原样处理', async () => {
    const construction = createVitePluginConstruction()
    const failure: unknown = 'fixture failure'
    const error = captureFailure(() => construction.run(() => {
      throw failure
    }))
    await expect(settleVitePluginConstructionFailure(error)).rejects.toBe('fixture failure')
    expect(settleVitePluginConstructionFailure(new Error('ordinary'))).toBeUndefined()
  })
})
