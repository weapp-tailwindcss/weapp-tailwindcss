import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { extractProjectCandidatesWithPositions } from '@/extraction/candidate-extractor/project'

const state = vi.hoisted(() => ({ files: [] as string[] }))
vi.mock('@/extraction/oxide', () => ({
  getOxideModule: async () => ({
    Scanner: class {
      files = state.files
      getCandidatesWithPositions({ content }: { content: string }) {
        return [{ candidate: content, position: 0 }]
      }
    },
  }),
}))

afterEach(() => vi.restoreAllMocks())

it('限制并发读取数量，并在读取乱序及单文件失败时保留报告顺序', async () => {
  const cwd = path.join(os.tmpdir(), 'candidate-read-concurrency')
  state.files = Array.from({ length: 70 }, (_, index) => path.join(cwd, `${index}.html`))
  let active = 0
  let maximum = 0
  let pending: Array<() => void> = []
  vi.spyOn(fs, 'readFile').mockImplementation(((file: string) => new Promise<string>((resolve, reject) => {
    active += 1
    maximum = Math.max(maximum, active)
    if (pending.length === 0) {
      setImmediate(() => {
        const batch = pending
        pending = []
        for (const finish of batch.reverse()) finish()
      })
    }
    pending.push(() => {
      active -= 1
      if (file === state.files[2]) reject(new Error('file removed'))
      else resolve(`candidate-${path.basename(file, '.html')}`)
    })
  })) as unknown as typeof fs.readFile)

  const report = await extractProjectCandidatesWithPositions({ cwd })
  expect(maximum).toBeGreaterThan(1)
  expect(maximum).toBeLessThanOrEqual(32)
  expect(active).toBe(0)
  expect(report.filesScanned).toBe(70)
  expect(report.entries.map(entry => entry.file)).toEqual(state.files.filter((_, index) => index !== 2))
  expect(report.skippedFiles).toEqual([{ file: state.files[2], reason: 'file removed' }])
})
