import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it, vi } from 'vitest'

const sampler = vi.hoisted(() => ({ sample: vi.fn() }))
vi.mock('../memory.mjs', () => ({ samplePosixMemory: sampler.sample }))

const { startProcess } = await import('../process.mjs')

it.runIf(process.platform !== 'win32')('退出后接收已发出的内存采样，不将等待采样计入构建耗时', async () => {
  const observation = Promise.withResolvers()
  sampler.sample.mockReturnValue(observation.promise)
  const session = await startProcess(process.execPath, ['-e', 'process.stdout.write("done")'])
  let resolved = false
  const completion = session.complete().then(result => { resolved = true; return result })
  try {
    await vi.waitFor(() => expect(session.log()).toBe('done'))
    await vi.waitFor(() => expect(() => session.ensureRunning()).toThrow())
    expect(resolved).toBe(false)
    const beforeObservation = performance.now() - session.startedAt
    // 留出确定性窗口，避免外部轮询与子进程退出回调之间的调度抖动造成误报。
    await delay(50)
    observation.resolve(64)
    const result = await completion
    expect(result.peakRssMb).toBe(64)
    // 若把采样等待计入耗时，结果会落在上述窗口之后；允许少量调度误差。
    expect(result.ms).toBeLessThanOrEqual(beforeObservation + 10)
  }
  finally { observation.resolve(null); await completion; await session.stop() }
})
