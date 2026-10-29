import type { CaptureEvidence } from '../tests/helpers/full-page/observed-sample'
import { Buffer } from 'node:buffer'
import { PNG } from 'pngjs'
import { beforeEach, expect, it, vi } from 'vitest'
import { createCaptureBudget } from '../tests/helpers/full-page/capture'
import { captureNativeSample, captureStableNativeFullPage } from '../tests/helpers/full-page/native'
import { FullPageCaptureError } from '../tests/helpers/full-page/stability'
import { captureStableFullPage, captureTiledSample } from '../tests/helpers/full-page/stable'
import { observedFixture, policy } from './full-page-observed/fixture'

const transport = vi.hoisted(() => ({ start: vi.fn(), observe: vi.fn(), wait: vi.fn(), images: vi.fn() }))
vi.mock('../tests/helpers/full-page/monitor', async importOriginal => ({ ...await importOriginal<object>(), startCaptureMonitor: transport.start }))
vi.mock('../tests/helpers/full-page/toc/observe', () => ({ observeToc: transport.observe }))
vi.mock('../tests/helpers/full-page/toc/readiness', () => ({ waitForTocReadiness: transport.wait }))
vi.mock('../tests/helpers/full-page/images', () => ({ prepareFullPageImages: transport.images }))

let fixture: ReturnType<typeof observedFixture>
beforeEach(() => {
  vi.clearAllMocks()
  fixture = observedFixture()
  transport.start.mockImplementation(async () => fixture.start())
  transport.observe.mockImplementation(async () => fixture.observe())
  transport.wait.mockResolvedValue(undefined)
  transport.images.mockResolvedValue(undefined)
})

function evidence(): CaptureEvidence {
  return { window: null, before: null, after: null }
}

function capture(mode: 'native' | 'tiled', observation: CaptureEvidence) {
  const budget = createCaptureBudget(5000)
  return mode === 'native'
    ? captureNativeSample(fixture.page, budget, policy, observation)
    : captureTiledSample(fixture.page, budget, policy, observation, 3)
}

function stable(mode: 'native' | 'tiled') {
  const budget = createCaptureBudget(5000)
  return mode === 'native'
    ? captureStableNativeFullPage(fixture.page, budget, policy)
    : captureStableFullPage(fixture.page, { budget, toc: policy, tileSize: 3 })
}

it.each(['native', 'tiled'] as const)('%s 用一个观察窗口覆盖完整像素采集、恢复和两端 TOC', async (mode) => {
  const observation = evidence()
  const image = await capture(mode, observation)
  expect([image!.width, image!.height]).toEqual([4, 6])
  expect([...image!.data.subarray(-4)]).toEqual([3, 5, 80, 255])
  expect(fixture.state.monitors).toHaveLength(1)
  expect(fixture.state.events[0]).toBe('start')
  expect(fixture.state.events.slice(-4)).toEqual(['settle', 'toc', 'finish', 'close'])
  expect(fixture.state.events.indexOf('toc')).toBeLessThan(fixture.state.events.indexOf('screenshot'))
  expect(observation.before?.ready).toBe(true)
  expect(observation.after).toEqual(observation.before)
  expect(observation.window?.fingerprint).toBe('same-composition')
  expect(transport.wait).toHaveBeenCalledWith(fixture.page, expect.anything(), policy)
  expect(transport.observe).toHaveBeenCalledTimes(2)
  for (const args of transport.observe.mock.calls) {
    expect(args).toEqual([fixture.page, policy])
  }
  const monitor = fixture.state.monitors[0]!
  expect(monitor.finish).toHaveBeenCalledOnce()
  expect(monitor.close).toHaveBeenCalledOnce()
  expect(fixture.state.screenshots).toHaveLength(mode === 'native' ? 1 : 4)
  for (const options of fixture.state.screenshots) {
    expect(options).toMatchObject({ fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css', type: 'png' })
  }
  if (mode === 'tiled') {
    expect(fixture.state.screenshots.map(options => options.clip)).toEqual([
      { x: 0, y: 0, width: 3, height: 3 },
      { x: 3, y: 0, width: 1, height: 3 },
      { x: 0, y: 3, width: 3, height: 3 },
      { x: 3, y: 3, width: 1, height: 3 },
    ])
  }
})

it.each([
  { tile: 1, reason: '捕获期间 TOC 或标题节点被插入、移除或重新挂载' },
  { tile: 2, reason: '捕获期间 TOC 祖先身份、合成属性或父关系改变' },
  { tile: 4, reason: '捕获期间视口、DPR 或滚动位置改变' },
])('第 $tile 片中的瞬态即使最终恢复，也拒绝整张分片样本', async ({ tile, reason }) => {
  fixture.state.onScreenshot = (monitor) => {
    if (fixture.state.screenshots.length === tile) {
      monitor.evidence.disturbances.push(reason)
    }
  }
  const observation = evidence()
  expect(await capture('tiled', observation)).toBeUndefined()
  expect(fixture.state.monitors).toHaveLength(1)
  expect(fixture.state.screenshots).toHaveLength(4)
  expect(observation.before?.ready).toBe(true)
  expect(observation.after).toEqual(observation.before)
  expect(observation.window?.disturbances).toEqual([reason])
  expect(fixture.state.monitors[0]!.close).toHaveBeenCalledOnce()
})

it('原生无效样本先完成观察再拒绝，不解析已经污染的 PNG', async () => {
  fixture.page.screenshot = async () => Buffer.from('invalid PNG must never be decoded')
  transport.start.mockImplementation(async () => {
    const monitor = fixture.start()
    monitor.evidence.disturbances.push('捕获期间 TOC 祖先属性发生改变')
    return monitor
  })
  const observation = evidence()
  expect(await capture('native', observation)).toBeUndefined()
  expect(observation.before?.ready).toBe(true)
  expect(observation.after?.ready).toBe(true)
  expect(observation.window?.completed).toBe(true)
  expect(fixture.state.events.slice(-4)).toEqual(['settle', 'toc', 'finish', 'close'])
})

it('原生有效样本在观察器排空并结束后才解码，保持原捕获窗口边界', async () => {
  const decode = vi.spyOn(PNG.sync, 'read')
  try {
    expect(await capture('native', evidence())).toBeDefined()
    expect(decode).toHaveBeenCalledOnce()
    expect(fixture.state.monitors[0]!.finish.mock.invocationCallOrder[0]).toBeLessThan(decode.mock.invocationCallOrder[0]!)
    expect(decode.mock.invocationCallOrder[0]).toBeLessThan(fixture.state.monitors[0]!.close.mock.invocationCallOrder[0]!)
  }
  finally {
    decode.mockRestore()
  }
})

it('分片中间的拒绝样本清空前张，随后必须重新收齐两张完整样本', async () => {
  fixture.state.onScreenshot = (monitor) => {
    if (fixture.state.monitors.length === 2 && fixture.state.screenshots.length === 6) {
      monitor.evidence.disturbances.push('TOC 祖先捕获期间存在未完成动画')
    }
  }
  const image = PNG.sync.read(await stable('tiled'))
  expect([...image.data.subarray(-4)]).toEqual([3, 5, 80, 255])
  expect(fixture.state.monitors).toHaveLength(4)
  expect(fixture.state.screenshots).toHaveLength(16)
  expect(fixture.listenerCount()).toBe(0)
  for (const monitor of fixture.state.monitors) {
    expect(monitor.close).toHaveBeenCalledOnce()
  }
})

for (const mode of ['native', 'tiled'] as const) {
  it.each(['heading', 'fingerprint'] as const)(`两张 PNG 相同而 %s 改变时，${mode} 不得提前确认稳定`, async (property) => {
    fixture.state.onStart = () => {
      if (fixture.state.monitors.length === 1) {
        fixture.state[property] = 'changed'
      }
    }
    await stable(mode)
    expect(fixture.state.monitors).toHaveLength(3)
    expect(fixture.listenerCount()).toBe(0)
  })

  it(`${mode} 的两个样本之间同 URL reload 也必须拒绝，并释放页面监听`, async () => {
    fixture.state.onGap = fixture.reload
    const error = await stable(mode).catch(error => error)
    expect(error).toBeInstanceOf(FullPageCaptureError)
    expect(error.cause.message).toContain('主 document 已导航或重新加载')
    expect(error.attempts).toBe(1)
    expect(fixture.state.monitors).toHaveLength(1)
    expect(fixture.listenerCount()).toBe(0)
  })
}

it('分片截图首错和观察器清理失败同时发生时，保留原异常对象及顺序', async () => {
  const original = new Error('second tile screenshot failure')
  const cleanup = new Error('monitor cleanup failure')
  fixture.state.onScreenshot = (monitor) => {
    monitor.close.mockRejectedValue(cleanup)
    if (fixture.state.screenshots.length === 2) {
      throw original
    }
  }
  const error = await capture('tiled', evidence()).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors).toEqual([original, cleanup])
  expect(error.cause).toBe(original)
  expect(fixture.state.monitors[0]!.close).toHaveBeenCalledOnce()
})

it('分片拒绝后的采样首错也提供完整诊断与最后样本，而不退回单张 PNG', async () => {
  const original = new Error('third sample screenshot failure')
  fixture.state.onScreenshot = (monitor) => {
    monitor.evidence.disturbances.push('捕获期间 TOC 祖先属性发生改变')
    if (fixture.state.monitors.length === 3) {
      throw original
    }
  }
  const error = await stable('tiled').catch(error => error)
  expect(error).toBeInstanceOf(FullPageCaptureError)
  expect(error.cause).toBe(original)
  expect(error.attempts).toBe(3)
  expect(error.evidence).toHaveLength(3)
  expect(error.evidence[0].window.disturbances).toEqual(Array.from({ length: 4 }).fill('捕获期间 TOC 祖先属性发生改变'))
  expect(error.evidence[2].before.ready).toBe(true)
  expect(error.evidence[2].window).toBeNull()
  expect(fixture.listenerCount()).toBe(0)
  expect(fixture.state.monitors[2]!.close).toHaveBeenCalledOnce()
})
