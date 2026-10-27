import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { createFrameworkSourceScanSession } from '@/bundlers/vite/shared/framework-source-scan-session'
import { createSourceCandidateCollector } from '@/bundlers/vite/source-candidates'
import { resolveSourceScanPath } from '@/tailwindcss/source-scan'

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vite-scan-profile-reentry-'))
  const first = path.join(root, 'first-existing.html')
  const second = path.join(root, 'second.html')
  const sources = [{ base: root, pattern: 'first-*.html', negated: false }]
  const collector = createSourceCandidateCollector({ extractor: source => [source] })
  const memory = createViteCssMemory({ debug: vi.fn(), getSourceCandidateSource: collector.source })
  const session = createFrameworkSourceScanSession({
    cssMemory: memory,
    debug: vi.fn(),
    getResolvedConfig: () => ({ root }),
    hmrCandidateState: {
      apply: (change: unknown) => change,
      createChange: (file: string, change: object) => ({ ...change, file }),
      clear: vi.fn(),
    } as any,
    isCandidateRequest: () => true,
    isWatchLikeBuild: () => true,
    opts: {},
    runtimeState: {
      tailwindRuntime: {
        majorVersion: 4,
        options: { projectRoot: root, tailwindcss: { cwd: root, v4: { base: root, sources } } },
      },
    } as any,
    shouldOwnTailwindGeneration: true,
    sourceCandidateCollector: collector,
  })
  const changeProfile = async (pattern: string) => {
    sources[0]!.pattern = pattern
    session.invalidate()
    await session.sync()
  }
  const dispose = async () => {
    await session.dispose()
    memory.dispose()
    await rm(root, { recursive: true, force: true })
  }
  await writeFile(first, 'first-original-candidate')
  await writeFile(second, 'second-profile-candidate')
  await session.sync()
  await changeProfile('second.html')
  return { root, first, collector, session, sources, changeProfile, dispose }
}

it.each(['delete', 'update', 'create'] as const)('来源范围 A→B 期间发生 %s，回到 A 必须读取当前文件状态', async (event) => {
  const { root, first, collector, session, sources, changeProfile, dispose } = await fixture()
  const file = event === 'create' ? path.join(root, 'first-created.html') : first
  try {
    if (event === 'delete') {
      await rm(file)
    }
    else {
      await writeFile(file, 'first-current-candidate')
    }
    session.queueChangedFile({ event, id: file })
    await session.flushChangedFiles()
    await changeProfile('first-*.html')

    const expected = event === 'delete'
      ? []
      : event === 'create' ? ['first-original-candidate', 'first-current-candidate'] : ['first-current-candidate']
    expect(collector.valuesForEntries(sources)).toEqual(new Set(expected))
    expect(session.getWatchFiles().has(resolveSourceScanPath(file))).toBe(event !== 'delete')
  }
  finally {
    await dispose()
  }
})

it('来源未变化的后续 watch 轮次继续复用当前会话扫描结果', async () => {
  const { collector, session, sources, dispose } = await fixture()
  const scan = vi.spyOn(collector, 'scanRoot')
  try {
    await session.sync()
    await session.sync()
    expect(collector.valuesForEntries(sources)).toEqual(new Set(['second-profile-candidate']))
    expect(scan).not.toHaveBeenCalled()
    expect(session.getStats().sourceCandidateScanCache).toBeLessThanOrEqual(8)
  }
  finally {
    scan.mockRestore()
    await dispose()
  }
})
