import path from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createOutputIntegrityMonitor } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/output-integrity'

const mocks = vi.hoisted(() => ({
  watchFile: vi.fn(),
  unwatchFile: vi.fn(),
  readFile: vi.fn(),
  delay: vi.fn(),
}))

vi.mock('node:fs', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs')>(),
  watchFile: mocks.watchFile,
  unwatchFile: mocks.unwatchFile,
}))
vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  readFile: mocks.readFile,
}))
vi.mock('node:timers/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:timers/promises')>(),
  setTimeout: mocks.delay,
}))

const monitors: NonNullable<ReturnType<typeof createOutputIntegrityMonitor>>[] = []
const releaseGates: (() => void)[] = []
const invalid = '.invalid{color:red}'
const valid = '.valid{color:red}'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  releaseGates.push(resolve)
  return { promise, resolve }
}

function fixture() {
  const file = path.resolve('integrity-fixture.wxss')
  let content = valid
  mocks.readFile.mockImplementation(async () => content)
  const monitor = createOutputIntegrityMonitor([{ file, forbiddenFragments: ['.invalid'] }])!
  monitors.push(monitor)
  const notify = mocks.watchFile.mock.calls[0]![2] as () => void
  return {
    file,
    monitor,
    notify,
    content: () => content,
    write: (value: string) => {
      content = value
    },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.delay.mockResolvedValue(undefined)
})

afterEach(async () => {
  for (const release of releaseGates.splice(0)) {
    release()
  }
  await Promise.all(monitors.splice(0).map(monitor => monitor.stop()))
})

it('自动监听的已确认中间违例在最终修正后仍保留', async () => {
  const item = fixture()
  await item.monitor.assertClean('initial')
  const confirming = deferred()
  const release = deferred()
  const confirmed = deferred()
  mocks.delay.mockImplementationOnce(async (milliseconds: number) => {
    expect(milliseconds).toBe(10)
    confirming.resolve()
    await release.promise
  })
  let reads = 0
  mocks.readFile.mockImplementation(async () => {
    const content = item.content()
    if (++reads === 2) {
      confirmed.resolve()
    }
    return content
  })
  item.write(invalid)
  item.notify()
  await confirming.promise
  release.resolve()
  await confirmed.promise
  // 只由监听回调驱动两次采样，最终 assertClean 才是下一次显式检查。
  item.write(valid)
  await expect(item.monitor.assertClean('final corrected output')).rejects.toThrow('output integrity violation')
})

it('确认期间已修正的内容不记录为持续违例', async () => {
  const item = fixture()
  await item.monitor.assertClean('initial')
  const confirming = deferred()
  const release = deferred()
  mocks.delay.mockImplementationOnce(async (milliseconds: number) => {
    expect(milliseconds).toBe(10)
    confirming.resolve()
    await release.promise
  })
  item.write(invalid)
  item.notify()
  await confirming.promise
  item.write(valid)
  release.resolve()
  await expect(item.monitor.assertClean('corrected before confirmation')).resolves.toBeUndefined()
  expect(mocks.delay).toHaveBeenCalledOnce()
})

it('assertClean 等待已排队的监听检查完成', async () => {
  const item = fixture()
  await item.monitor.assertClean('initial')
  mocks.readFile.mockClear()
  const confirming = deferred()
  const release = deferred()
  mocks.delay.mockImplementationOnce(async () => {
    confirming.resolve()
    await release.promise
  })
  item.write(invalid)
  item.notify()
  await confirming.promise
  item.write(valid)
  item.notify()
  let settled = false
  const checking = item.monitor.assertClean('queued updates').then(() => {
    settled = true
  })
  await setImmediate()
  expect(settled).toBe(false)
  release.resolve()
  await checking
  expect(settled).toBe(true)
  // 第一轮两次读取、后续监听一轮和显式检查一轮都必须排空。
  expect(mocks.readFile).toHaveBeenCalledTimes(4)
})

it('stop 解除非持久文件监听并等待进行中的确认和最终检查', async () => {
  const item = fixture()
  expect(mocks.watchFile).toHaveBeenCalledExactlyOnceWith(item.file, { interval: 10, persistent: false }, expect.any(Function))
  await item.monitor.assertClean('initial')
  mocks.readFile.mockClear()
  const confirming = deferred()
  const release = deferred()
  const finalConfirming = deferred()
  const releaseFinal = deferred()
  mocks.delay.mockImplementationOnce(async () => {
    confirming.resolve()
    await release.promise
  })
  mocks.delay.mockImplementationOnce(async () => {
    finalConfirming.resolve()
    await releaseFinal.promise
  })
  item.write(invalid)
  item.notify()
  await confirming.promise
  let settled = false
  const stopping = item.monitor.stop().then(() => {
    settled = true
  })
  expect(mocks.unwatchFile).toHaveBeenCalledWith(item.file)
  await setImmediate()
  expect(settled).toBe(false)
  release.resolve()
  await finalConfirming.promise
  await setImmediate()
  expect(settled).toBe(false)
  releaseFinal.resolve()
  await stopping
  expect(settled).toBe(true)
  expect(mocks.readFile).toHaveBeenCalledTimes(4)
  item.write(valid)
  await expect(item.monitor.assertClean('after stop')).rejects.toThrow('output integrity violation')
})

it('缺失文件不产生违例，后续检查仍能发现重建的无效内容', async () => {
  const item = fixture()
  await item.monitor.assertClean('initial')
  mocks.readFile.mockRejectedValueOnce(Object.assign(new Error('missing file'), { code: 'ENOENT' }))
  await expect(item.monitor.assertClean('temporarily missing')).resolves.toBeUndefined()
  item.write(invalid)
  await expect(item.monitor.assertClean('recreated invalid file')).rejects.toThrow('output integrity violation')
})

it('没有 guard 时不注册监听或排队读取', () => {
  expect(createOutputIntegrityMonitor(undefined)).toBeUndefined()
  expect(createOutputIntegrityMonitor([])).toBeUndefined()
  expect(mocks.watchFile).not.toHaveBeenCalled()
  expect(mocks.readFile).not.toHaveBeenCalled()
})
