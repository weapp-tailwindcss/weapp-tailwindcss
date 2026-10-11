import { afterEach, describe, expect, it, vi } from 'vitest'

const source = (id: string) => ({ projectRoot: '/workspace', base: '/workspace', baseFallbacks: [], css: `/* ${id} */`, dependencies: [id] })

async function setup() {
  const instances: any[] = []
  vi.doMock('@/generator', () => ({
    createWeappTailwindcssGenerator: vi.fn((input) => {
      const instance = {
        source: input,
        dispose: vi.fn(),
        validateCandidates: vi.fn(async () => new Set(['block'])),
        generate: vi.fn(async () => ({ css: '', dependencies: [...input.dependencies], classSet: new Set(['block']) })),
      }
      instances.push(instance)
      return instance
    }),
  }))
  const { TailwindGenerationSessionPool } = await import('@/compiler/tailwind-generation-session-pool')
  return { pool: new TailwindGenerationSessionPool(), instances }
}

describe('生成会话的依赖失效边界', () => {
  afterEach(() => { vi.doUnmock('@/generator'); vi.resetModules() })

  it.each(['/repo/theme.css', 'C:\\repo\\theme.css', 'C:\\', '/', './theme.css', '../theme.css', 'virtual:theme?raw'])('仅失效精确依赖 %s 的会话', async (id) => {
    const { pool, instances } = await setup()
    await pool.generate(source(id))
    await pool.generate(source('other'))
    pool.invalidate({ type: 'dependencies', paths: [id] })
    expect(instances[0].dispose).toHaveBeenCalledOnce()
    expect(instances[1].dispose).not.toHaveBeenCalled()
    await pool.generate(source('other'))
    expect(instances).toHaveLength(2)
    pool.dispose()
  })

  it('编译图协调器只释放 shadow 会话中受影响的入口，连续保存合并失效', async () => {
    const { pool, instances } = await setup()
    const { CompilationSessionPool } = await import('@/compiler/compilation-session-pool')
    const { CompilationChangeCoordinator } = await import('@/compiler/compilation-change-coordinator')
    const graph = new CompilationSessionPool()
    const coordinator = new CompilationChangeCoordinator(graph, pool)
    try {
      for (const id of ['a', 'b']) {
        await pool.generate(source(`${id}-config`))
        await graph.run({
          scope: { id, kind: 'global' }, outputId: `${id}.css`,
          sources: [{ id: `${id}.css`, kind: 'css', candidates: ['block'] }],
        }, async () => ({ classSet: ['block'], dependenciesBySource: [[`${id}.css`, [{ id: `${id}-config`, kind: 'config' as const }]]] }))
      }
      const change = [{ id: 'a-config', type: 'dependency-changed' as const }]
      expect(coordinator.record(change)).toEqual(new Set(['a']))
      expect(coordinator.record(change)).toEqual(new Set(['a']))
      expect(instances.map(item => item.dispose.mock.calls.length)).toEqual([1, 0])
      expect(coordinator.getScopeDependencyRevision('a')).toBe(1)
      expect(coordinator.getScopeDependencyRevision('b')).toBe(0)
    }
    finally { coordinator.dispose(); await graph.dispose(); pool.dispose() }
  })

  it('记录生成时发现的间接依赖，并失效全部共享消费者', async () => {
    const { pool, instances } = await setup()
    for (const id of ['a', 'b', 'c']) await pool.generate(source(id))
    for (const index of [0, 1]) instances[index].generate.mockResolvedValue({ dependencies: ['shared-config'] })
    await pool.generate(source('a'))
    await pool.generate(source('b'))
    pool.invalidate({ type: 'dependencies', paths: new Set(['shared-config', 'shared-config']) })
    expect(instances.map(item => item.dispose.mock.calls.length)).toEqual([1, 1, 0])
    pool.dispose()
  })

  it('尚未生成的校验会话与已失败的会话保守失效', async () => {
    const { pool, instances } = await setup()
    await pool.generate(source('a'))
    await pool.validateCandidates(source('validation'), ['block'])
    await pool.generate(source('failed'))
    instances[2].generate.mockRejectedValueOnce(new Error('missing import'))
    await expect(pool.generate(source('failed'))).rejects.toThrow('missing import')
    await pool.generate(source('unaffected'))
    pool.invalidate({ type: 'dependencies', paths: ['a'] })
    expect(instances.map(item => item.dispose.mock.calls.length)).toEqual([1, 1, 1, 0])
    pool.dispose()
  })

  it.each([undefined, ['unknown']])('缺少依赖归属时完整失效：%s', async (paths) => {
    const { pool, instances } = await setup()
    await pool.generate(source('a'))
    await pool.generate(source('b'))
    pool.invalidate({ type: 'dependencies', paths })
    expect(instances.map(item => item.dispose.mock.calls.length)).toEqual([1, 1])
  })

  it('混合已知和未知依赖时完整失效，空变更不失效', async () => {
    const { pool, instances } = await setup()
    await pool.generate(source('a'))
    await pool.generate(source('b'))
    pool.invalidate({ type: 'dependencies', paths: [] })
    expect(pool.size).toBe(2)
    pool.invalidate({ type: 'dependencies', paths: ['a', 'unknown'] })
    expect(instances.map(item => item.dispose.mock.calls.length)).toEqual([1, 1])
  })

  it.each(['validation', 'failure'])('并发 %s 之后，旧生成完成不能恢复依赖完整性', async (operation) => {
    const { pool, instances } = await setup()
    await pool.generate(source('changed'))
    await pool.generate(source('racing'))
    let resolve!: (value: any) => void
    instances[1].generate.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const pending = pool.generate(source('racing'))
    if (operation === 'validation') {
      await pool.validateCandidates(source('racing'), ['block'])
    }
    else {
      instances[1].generate.mockRejectedValueOnce(new Error('dependency removed'))
      await expect(pool.generate(source('racing'))).rejects.toThrow('dependency removed')
    }
    resolve({ dependencies: ['racing'] })
    await pending
    pool.invalidate({ type: 'dependencies', paths: ['changed'] })
    expect(instances[1].dispose).toHaveBeenCalledOnce()
    pool.dispose()
  })

  it('LRU 淘汰后不保留旧依赖归属', async () => {
    const { pool, instances } = await setup()
    for (let index = 0; index < 33; index++) await pool.generate(source(`entry-${index}`))
    expect(pool.size).toBe(32)
    expect(instances[0].dispose).toHaveBeenCalledOnce()
    pool.invalidate({ type: 'dependencies', paths: ['entry-0'] })
    expect(pool.size).toBe(0)
    expect(instances.every(instance => instance.dispose.mock.calls.length === 1)).toBe(true)
  })

  it('失效期间的旧异步结果不能把依赖挂到新实例', async () => {
    const { pool, instances } = await setup()
    await pool.generate(source('a'))
    await pool.generate(source('b'))
    let resolve!: (value: any) => void
    instances[0].generate.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const pending = pool.generate(source('a'))
    pool.invalidate({ type: 'dependencies', paths: ['b'] })
    await pool.generate(source('a'))
    resolve({ dependencies: ['stale-only'] })
    await pending
    await pool.generate(source('stale-only'))
    pool.invalidate({ type: 'dependencies', paths: ['stale-only'] })
    expect(instances[2].dispose).not.toHaveBeenCalled()
    expect(instances[3].dispose).toHaveBeenCalledOnce()
    pool.dispose()
  })
})
