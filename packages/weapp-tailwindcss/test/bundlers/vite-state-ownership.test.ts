import type { Plugin, ResolvedConfig } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { createDebug } from '@/debug'
import { createFrameworkCssAssets } from '@/bundlers/vite/shared/framework-css-assets'
import { createFrameworkCssGenerationQueue } from '@/bundlers/vite/shared/framework-css-generation-queue'
import { createFrameworkRuntimeLifecycle } from '@/bundlers/vite/shared/framework-runtime-lifecycle'

function hook(plugin: Plugin, name: 'closeBundle' | 'closeWatcher') {
  const value = plugin[name] as any
  return typeof value === 'function' ? value : value.handler
}

describe('Vite 状态所有权', () => {
  it('watch 中间轮次保留状态，关闭 watcher 后仅释放一次', async () => {
    const dispose = vi.fn(async () => {})
    const plugin = createFrameworkRuntimeLifecycle({
      getResolvedConfig: () => ({ build: { watch: {} } } as ResolvedConfig),
      dispose,
    })
    await hook(plugin, 'closeBundle')()
    expect(dispose).not.toHaveBeenCalled()
    await Promise.all([hook(plugin, 'closeWatcher')(), hook(plugin, 'closeWatcher')()])
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('普通构建完成后释放状态', async () => {
    const dispose = vi.fn(async () => {})
    const plugin = createFrameworkRuntimeLifecycle({
      getResolvedConfig: () => ({ build: {} } as ResolvedConfig),
      dispose,
    })
    await hook(plugin, 'closeBundle')()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('释放队列会等待已接收的任务，失败任务不阻断后续请求', async () => {
    const order: number[] = []
    const pending = Promise.withResolvers<void>()
    const queue = createFrameworkCssGenerationQueue(id => id, async (_id, value: number) => {
      if (value === 1) {
        await pending.promise
        throw new Error('failed')
      }
      order.push(value)
      return value
    })
    const first = queue('entry.css', 1)
    const rejected = expect(first).rejects.toThrow('failed')
    const second = queue('entry.css', 2)
    const disposal = queue.dispose()
    pending.resolve()
    await rejected
    expect(await second).toBe(2)
    await disposal
    expect(order).toEqual([2])
    await expect(queue('entry.css', 3)).rejects.toThrow('disposed')
  })

  it('资产释放清空所有者状态但不污染其他插件实例', () => {
    const options = { debug: createDebug(), getSourceCandidateSource: () => undefined }
    const first = createFrameworkCssAssets(options)
    const second = createFrameworkCssAssets(options)
    first.recordCssAssetResult('theme.acss', '.first{}')
    first.recordViteProcessedCssAssetResult('theme.acss', '.first{}')
    first.generatedClassSetByFile.set('theme.acss', new Set(['first']))
    first.cssMemory.rememberCssSource({ outputFile: 'theme.acss', sourceFile: 'entry.css', rawSource: '.first{}' })
    second.recordCssAssetResult('theme.acss', '.second{}')
    first.dispose()
    expect(first.getStats().cleanGeneratedCssByFile).toBe(0)
    expect(first.getStats().generatedClassSetByFile).toBe(0)
    expect(first.getStats().viteProcessedCssAssetResults).toBe(0)
    expect(first.getStats().rememberedCssSources).toBe(0)
    expect(second.getStats().cleanGeneratedCssByFile).toBe(1)
  })
})
