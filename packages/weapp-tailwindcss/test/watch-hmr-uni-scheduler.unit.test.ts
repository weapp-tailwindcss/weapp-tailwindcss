import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPollingBuildScheduler } from '../../../scripts/uni-e2e-watch/scheduler.mjs'
import { collectSourceSnapshot } from '../../../scripts/uni-e2e-watch/source-snapshot.mjs'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

async function flush() {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve()
  }
}

function harness() {
  let source = new Map([['index.vue', '0:100']])
  let stopping = false
  const builds: Array<ReturnType<typeof deferred> & { input: Map<string, string> }> = []
  const states: Array<{ generation: number, status: string }> = []
  const collectSnapshot = vi.fn(async () => new Map(source))
  const scheduler = createPollingBuildScheduler({
    collectSnapshot,
    runBuild: async () => {
      const build = { ...deferred(), input: new Map(source) }
      builds.push(build)
      await build.promise
    },
    onState: (state: { generation: number, status: string }) => states.push(state),
    isStopping: () => stopping,
  })
  return {
    ...scheduler,
    builds,
    states,
    collectSnapshot,
    update: (next: Map<string, string>) => { source = next },
    stop: () => { stopping = true },
  }
}

describe('uni polling build 的单飞调度', () => {
  it('初始构建与轮询共用生命周期，构建中多次变更合并为一次追赶', async () => {
    const f = harness()
    const pending = f.poll()
    await flush()
    f.update(new Map([['index.vue', '1:100']]))
    expect(f.poll()).toBe(pending)
    f.update(new Map([['index.vue', '2:100']]))
    expect(f.poll()).toBe(pending)
    expect(f.collectSnapshot).toHaveBeenCalledTimes(1)
    expect(f.builds).toHaveLength(1)
    f.builds[0]!.resolve()
    await flush()
    expect(f.builds).toHaveLength(2)
    expect(f.builds[1]!.input.get('index.vue')).toBe('2:100')
    f.builds[1]!.resolve()
    await pending
    expect(f.states).toEqual([
      { generation: 1, status: 'start' },
      { generation: 2, status: 'start' },
      { generation: 2, status: 'idle' },
    ])
    await f.poll()
    expect(f.builds).toHaveLength(2)
  })

  it.each([
    ['原子回退后的新 mtime', new Map([['index.vue', '2:100']])],
    ['源码删除', new Map<string, string>()],
    ['相同元数据的重命名', new Map([['renamed.vue', '0:100']])],
  ])('%s 仍须完成追赶构建', async (_name, snapshot) => {
    const f = harness()
    const pending = f.poll()
    await flush()
    f.update(snapshot)
    f.builds[0]!.resolve()
    await flush()
    expect(f.builds).toHaveLength(2)
    f.builds[1]!.resolve()
    await pending
    expect(f.states.at(-1)).toEqual({ generation: 2, status: 'idle' })
  })

  it('扫描中停止不会启动构建', async () => {
    const f = harness()
    const pending = f.poll()
    f.stop()
    await pending
    expect(f.builds).toHaveLength(0)
    expect(f.states).toHaveLength(0)
  })

  it('构建中停止不启动追赶，也不声明成功 idle', async () => {
    const f = harness()
    const pending = f.poll()
    await flush()
    f.update(new Map([['index.vue', '1:100']]))
    f.stop()
    f.builds[0]!.resolve()
    await pending
    expect(f.builds).toHaveLength(1)
    expect(f.states).toEqual([{ generation: 1, status: 'start' }])
  })

  it('构建失败保留错误且不声明成功 idle', async () => {
    const f = harness()
    const failure = new Error('真实构建失败')
    const pending = f.poll()
    const assertion = expect(pending).rejects.toBe(failure)
    await flush()
    f.builds[0]!.reject(failure)
    await assertion
    expect(f.states).toEqual([{ generation: 1, status: 'start' }])
  })
})

describe('uni 源码快照的临时文件归属', () => {
  it('只排除原子写入器的临时文件，保留普通隐藏源码和 tmp 文件', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'uni-source-snapshot-'))
    roots.push(root)
    const src = path.join(root, 'src')
    await mkdir(src)
    const ownedTmp = '.index.vue.123.12345678-1234-1234-1234-123456789012.tmp'
    await Promise.all(['index.vue', '.custom.vue', 'custom.tmp', ownedTmp, 'auto-imports.d.ts']
      .map(name => writeFile(path.join(src, name), 'source')))
    const before = await collectSourceSnapshot(root)
    expect([...before.keys()].map(file => path.basename(file)).sort()).toEqual(['.custom.vue', 'custom.tmp', 'index.vue'])
    await rm(path.join(src, ownedTmp))
    expect(await collectSourceSnapshot(root)).toEqual(before)
    await rm(path.join(src, 'index.vue'))
    expect((await collectSourceSnapshot(root)).has(path.join(src, 'index.vue'))).toBe(false)
  })
})
