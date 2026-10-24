import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { createFrameworkSourceDiscovery } from '@/bundlers/vite/shared/framework-source-discovery'
import { createSourceCandidateCollector } from '@/bundlers/vite/source-candidates'

const dependencies = vi.hoisted(() => ({
  resolve: vi.fn(async (..._args: unknown[]) => [] as string[]),
  discover: vi.fn(async () => [] as string[]),
  entries: vi.fn(async () => ({ dependencies: [] as string[] })),
}))
vi.mock('@/bundlers/vite/source-scan', async importOriginal => ({
  ...await importOriginal<typeof import('@/bundlers/vite/source-scan')>(),
  resolveViteTailwindV4CssDependencies: (...args: unknown[]) => dependencies.resolve(...args),
  discoverTailwindV4CssEntries: () => dependencies.discover(),
  resolveTailwindV4EntriesFromCssCached: () => dependencies.entries(),
}))

const directories: string[] = []
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function fixture(explicit = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vite-discovery-lifecycle-'))
  directories.push(root)
  const file = path.join(root, 'author-entry.css')
  const css = '@import "tailwindcss"; .author { color: red }'
  const collector = createSourceCandidateCollector({ extractor: () => ['discovered-candidate'] })
  const memory = createViteCssMemory({ debug: vi.fn(), getSourceCandidateSource: collector.source })
  const opts: any = explicit ? { tailwindcss: { v4: { cssSources: [{ file, css: 'explicit-css' }] } } } : {}
  const refresh = vi.fn(async () => {})
  const discovery = createFrameworkSourceDiscovery({
    opts,
    hasInitialTailwindCssRoots: explicit,
    shouldOwnTailwindGeneration: true,
    tailwindcssMajorVersion: 4,
    weappTailwindcssPackageDir: path.join(root, 'package'),
    debug: vi.fn(),
    sourceCandidateCollector: collector,
    cssMemory: memory,
    sourceScanSession: { cacheCurrent: vi.fn(), invalidate: vi.fn(), sync: vi.fn(async () => {}) } as any,
    refreshRuntimeState: refresh as any,
    getResolvedConfig: () => ({ root }) as any,
  })
  return { file, css, collector, memory, opts, refresh, discovery }
}

describe('自动发现 CSS 来源的删除与关闭', () => {
  afterEach(async () => {
    dependencies.resolve.mockReset().mockResolvedValue([])
    dependencies.discover.mockReset().mockResolvedValue([])
    dependencies.entries.mockReset().mockResolvedValue({ dependencies: [] })
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
  })

  it('删除撤销等待依赖解析的注册，同名重建仅保留新代际', async () => {
    const { file, css, memory, opts, discovery } = await fixture()
    const started = deferred()
    const blocked = deferred()
    dependencies.resolve.mockImplementationOnce(async () => {
      started.resolve()
      await blocked.promise
      return ['old-dependency']
    })
    const old = discovery.registerAutoCssSource(file, css)
    await started.promise
    try {
      await discovery.removeSource(`${file}?direct`)
      memory.restoreSource(file)
      await discovery.registerAutoCssSource(file, css.replace('red', 'blue'))
    }
    finally {
      blocked.resolve()
      await old
    }
    expect(opts.tailwindcss.v4.cssSources).toHaveLength(1)
    expect(opts.tailwindcss.v4.cssSources[0]).toMatchObject({ css: expect.stringContaining('blue'), dependencies: [] })
    expect(discovery.transientAutoCssSources.get(file)?.css).toContain('blue')
    expect(memory.getStats().pendingCssSourceOwners).toBe(0)
    await discovery.dispose()
    memory.dispose()
  })

  it('删除自动来源允许相同内容重新登记，并保留用户显式配置', async () => {
    const owned = await fixture()
    await owned.discovery.registerAutoCssSource(owned.file, owned.css)
    await owned.discovery.removeSource(owned.file)
    expect(owned.opts.tailwindcss.v4.cssSources).toEqual([])
    expect(owned.discovery.transientAutoCssSources.size).toBe(0)
    owned.memory.restoreSource(owned.file)
    await owned.discovery.registerAutoCssSource(owned.file, owned.css)
    expect(owned.opts.tailwindcss.v4.cssSources).toHaveLength(1)
    await owned.discovery.dispose()
    owned.memory.dispose()

    const explicit = await fixture(true)
    await explicit.discovery.registerAutoCssSource(explicit.file, explicit.css)
    await explicit.discovery.removeSource(explicit.file)
    expect(explicit.opts.tailwindcss.v4.cssSources).toEqual([{ file: explicit.file, css: 'explicit-css' }])
    await explicit.discovery.dispose()
    explicit.memory.dispose()
  })

  it('扫描重复内容不能取消已经提交配置的必要刷新', async () => {
    const { file, css, memory, opts, refresh, discovery } = await fixture()
    const secondFile = path.join(path.dirname(file), 'another-entry.css')
    const secondCss = css.replace('red', 'blue')
    await writeFile(secondFile, secondCss)
    const started = deferred()
    const blocked = deferred()
    refresh.mockImplementationOnce(async () => {
      started.resolve()
      await blocked.promise
    })
    const first = discovery.registerAutoCssSource(file, css)
    await started.promise
    const second = discovery.registerAutoCssSource(secondFile, secondCss)
    try {
      await vi.waitFor(() => expect(discovery.transientAutoCssSources.has(secondFile)).toBe(true))
      dependencies.discover.mockResolvedValue([secondFile])
      await discovery.discoverAndRegisterAutoCssSources()
    }
    finally {
      blocked.resolve()
      await Promise.all([first, second])
    }
    expect(opts.tailwindcss.v4.cssSources).toHaveLength(2)
    expect(refresh).toHaveBeenCalledTimes(2)
    await discovery.dispose()
    memory.dispose()
  })

  it('扫描发现等待解析时删除来源，旧扫描不能恢复配置或候选', async () => {
    const { file, css, collector, memory, opts, discovery } = await fixture()
    await writeFile(file, css)
    const started = deferred()
    const blocked = deferred()
    dependencies.discover.mockResolvedValue([file])
    dependencies.entries.mockImplementationOnce(async () => {
      started.resolve()
      await blocked.promise
      return { dependencies: ['stale-dependency'] }
    })
    const scanning = discovery.discoverAndRegisterAutoCssSources()
    await started.promise
    await discovery.removeSource(file)
    blocked.resolve()
    await scanning
    expect(opts.tailwindcss?.v4?.cssSources ?? []).toEqual([])
    expect(collector.values()).toEqual(new Set())
    expect(memory.getStats().pendingCssSourceOwners).toBe(0)
    await discovery.dispose()
    memory.dispose()
  })

  it('关闭排空已接收的注册，旧任务和后续调用均不能恢复来源', async () => {
    const { file, css, memory, opts, discovery } = await fixture()
    const started = deferred()
    const blocked = deferred()
    dependencies.resolve.mockImplementationOnce(async () => {
      started.resolve()
      await blocked.promise
      return []
    })
    const pending = discovery.registerAutoCssSource(file, css)
    await started.promise
    let closed = false
    const disposal = discovery.dispose()
    expect(discovery.dispose()).toBe(disposal)
    const closing = disposal.then(() => {
      closed = true
    })
    try {
      await Promise.resolve()
      await Promise.resolve()
      expect(closed).toBe(false)
    }
    finally {
      blocked.resolve()
      await Promise.all([pending, closing])
    }
    await discovery.registerAutoCssSource(file, css)
    expect(opts.tailwindcss?.v4?.cssSources ?? []).toEqual([])
    expect(discovery.transientAutoCssSources.size).toBe(0)
    memory.dispose()
  })
})
