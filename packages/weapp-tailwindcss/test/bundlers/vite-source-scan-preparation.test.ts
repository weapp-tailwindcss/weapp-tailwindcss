import type { SourceCandidateCollectorOptions } from '@/project-sources/candidates/types-and-cache'
import { mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { createFrameworkSourceScanSession } from '@/bundlers/vite/shared/framework-source-scan-session'
import { createSourceCandidateCollector } from '@/bundlers/vite/source-candidates'

const cleanups: Array<() => Promise<unknown>> = []
const extract = (source: string) => [source]

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vite-scan-preparation-'))
  const file = path.join(root, 'entry.html')
  await writeFile(file, 'first-candidate')
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const create = (options: SourceCandidateCollectorOptions = {}, pattern = '*.html') => {
    const collector = createSourceCandidateCollector({ extractor: extract, ...options })
    const memory = createViteCssMemory({ debug: vi.fn(), getSourceCandidateSource: collector.source })
    const session = createFrameworkSourceScanSession({
      cssMemory: memory,
      debug: vi.fn(),
      getResolvedConfig: () => ({ root }),
      hmrCandidateState: { apply: (value: unknown) => value, createChange: (file: string, change: object) => ({ file, ...change }), clear: vi.fn() } as any,
      isCandidateRequest: () => true,
      isWatchLikeBuild: () => true,
      opts: {},
      runtimeState: { tailwindRuntime: { majorVersion: 4, options: { projectRoot: root, tailwindcss: { cwd: root, v4: { base: root, sources: [{ base: root, pattern, negated: false }] } } } } } as any,
      shouldOwnTailwindGeneration: true,
      sourceCandidateCollector: collector,
    })
    const dispose = async () => {
      await session.dispose()
      memory.dispose()
    }
    cleanups.push(dispose)
    return { collector, session, dispose, scan: vi.spyOn(collector, 'scanRoot') }
  }
  return { root, file, create }
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup()
  }
})

it('新实例复用已核实的扫描准备结果，并保持转换层、候选、revision 和释放独立', async () => {
  const { root, file, create } = await fixture()
  const first = create()
  await first.session.sync()
  await first.collector.merge(file, 'first-transform')
  await first.collector.syncCss(path.join(root, 'style.css'), 'first-css')
  await first.collector.syncModuleSource(path.join(root, 'virtual.js'), 'first-module')
  first.session.cacheCurrent()

  const second = create()
  await second.collector.merge(file, 'second-transform')
  await second.session.sync()
  expect(second.scan).not.toHaveBeenCalled()
  expect(second.collector.values()).toEqual(new Set(['first-candidate', 'second-transform']))
  expect(second.collector.snapshot().cssSourceById).toEqual([])
  expect(second.collector.snapshot().moduleSourceById).toEqual([])
  const revision = second.collector.getRevision()
  await first.session.syncChangedFile(file, 'first-only-update')
  expect(second.collector.getRevision()).toBe(revision)
  expect(second.collector.values()).toEqual(new Set(['first-candidate', 'second-transform']))
  await first.dispose()
  expect(second.collector.getRevision()).toBe(revision)
  expect(second.collector.values()).toEqual(new Set(['first-candidate', 'second-transform']))
  await second.session.syncChangedFile(file, 'second-only-update')
  expect(second.collector.values()).toEqual(new Set(['second-only-update']))
})

it.each(['update', 'create', 'delete'] as const)('新实例启动前未观察到 %s 事件，不能恢复旧扫描结果', async (event) => {
  const { root, file, create } = await fixture()
  const first = create()
  await first.session.sync()
  if (event === 'delete') {
    await rm(file)
  }
  else if (event === 'create') {
    await writeFile(path.join(root, 'added.html'), 'added-candidate')
  }
  else {
    const before = await stat(file)
    await writeFile(file, 'other-candidate')
    await utimes(file, before.atime, before.mtime)
    expect((await stat(file)).size).toBe(before.size)
  }
  const second = create()
  await second.session.sync()
  expect(second.scan).toHaveBeenCalledOnce()
  expect(second.collector.values()).toEqual(new Set(event === 'delete' ? [] : event === 'create' ? ['first-candidate', 'added-candidate'] : ['other-candidate']))
  expect(first.collector.values()).toEqual(new Set(['first-candidate']))
})

it('同源码但捕获值不同的提取器拥有各自的准备结果', async () => {
  const { create } = await fixture()
  const extractor = (suffix: string) => (source: string) => [source + suffix]
  const first = create({ extractor: extractor('-first') })
  await first.session.sync()
  const second = create({ extractor: extractor('-second') })
  await second.session.sync()
  expect(second.scan).toHaveBeenCalledOnce()
  expect(second.collector.values()).toEqual(new Set(['first-candidate-second']))
})

it('新实例核验期间到达的来源事件撤销旧准备结果', async () => {
  const { file, create } = await fixture()
  const first = create()
  await first.session.sync()
  const second = create()
  const resolveFiles = second.collector.resolveScanFiles
  let release!: () => void
  let entered!: () => void
  const blocked = new Promise<void>((resolve) => { release = resolve })
  const started = new Promise<void>((resolve) => { entered = resolve })
  vi.spyOn(second.collector, 'resolveScanFiles').mockImplementationOnce(async (options) => {
    entered()
    await blocked
    return resolveFiles(options)
  })
  const preparing = second.session.sync()
  await started
  first.session.queueChangedFile({ event: 'update', id: file })
  await first.session.flushChangedFiles()
  release()
  await preparing
  expect(second.scan).toHaveBeenCalledOnce()
  expect(second.collector.values()).toEqual(new Set(['first-candidate']))
})

it('提取选项或解析后的来源范围改变时，使用各自的准备结果', async () => {
  const { root, create } = await fixture()
  await writeFile(path.join(root, 'other.ts'), 'other-source')
  const first = create()
  await first.session.sync()
  const differentOptions = create({ disabledDefaultTemplateHandler: true })
  await differentOptions.session.sync()
  expect(differentOptions.scan).toHaveBeenCalledOnce()
  const differentSources = create({}, '*.ts')
  await differentSources.session.sync()
  expect(differentSources.scan).toHaveBeenCalledOnce()
  expect(differentSources.collector.values()).toEqual(new Set(['other-source']))
})
