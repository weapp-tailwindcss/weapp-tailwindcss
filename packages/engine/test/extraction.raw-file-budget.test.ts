import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { extractProjectCandidatesWithPositions } from '@/extraction/candidate-extractor/project'
import { extractRawCandidates } from '@/extraction/candidate-extractor/raw'

const state = vi.hoisted(() => ({ files: [] as string[], scanned: [] as string[] }))
vi.mock('@/extraction/oxide', () => ({
  getOxideModule: async () => ({
    Scanner: class {
      files = state.files
      scan() {
        return [...state.scanned]
      }

      scanFiles(contents: Array<{ content: string }>) {
        return contents.map(({ content }) => content)
      }

      getCandidatesWithPositions({ content }: { content: string }) {
        return [{ candidate: content, position: 0 }]
      }
    },
  }),
}))

afterEach(() => vi.restoreAllMocks())

it.each([false, true])('并发原始补扫与位置扫描共享文件预算，保留全部候选和报告顺序；任意值补扫=%s', async (bare) => {
  const cwd = path.join(os.tmpdir(), 'raw-candidate-file-budget')
  state.files = Array.from({ length: 80 }, (_, index) => path.join(cwd, `${index}.html`))
  state.scanned = bare ? ['flex'] : []
  const candidate = (file: string) => bare ? `w-${Number(path.basename(file, '.html')) + 1}rpx` : `w-[${path.basename(file, '.html')}px]`
  let active = 0
  let peak = 0
  vi.spyOn(fs, 'stat').mockResolvedValue({ size: 10, mtimeMs: 1 } as Awaited<ReturnType<typeof fs.stat>>)
  vi.spyOn(fs, 'readFile').mockImplementation((async (file: string) => {
    active++
    peak = Math.max(peak, active)
    try {
      if (active > 16) {
        throw Object.assign(new Error('EMFILE: file budget exhausted'), { code: 'EMFILE' })
      }
      await setImmediate()
      return candidate(file)
    }
    finally {
      active--
    }
  }) as unknown as typeof fs.readFile)

  const [first, second, report] = await Promise.all([
    extractRawCandidates([{ base: cwd, pattern: 'first/**/*.html', negated: false }], { bareArbitraryValues: bare }),
    extractRawCandidates([{ base: cwd, pattern: 'second/**/*.html', negated: false }], { bareArbitraryValues: bare }),
    extractProjectCandidatesWithPositions({ cwd }),
  ])
  const expected = new Set([...state.scanned, ...state.files.map(candidate)])
  expect(new Set(first)).toEqual(expected)
  expect(new Set(second)).toEqual(expected)
  expect(report.skippedFiles).toEqual([])
  expect(report.entries.map(entry => entry.file)).toEqual(state.files)
  expect(active).toBe(0)
  expect(peak).toBeLessThanOrEqual(16)
})
