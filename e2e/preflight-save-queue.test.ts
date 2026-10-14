import type { PreflightReport } from '../scripts/e2e-preflight/types'
import { expect, it, vi } from 'vitest'
import { writeReport } from '../scripts/e2e-preflight/io'
import { PreflightSession } from '../scripts/e2e-preflight/session'

vi.mock('../scripts/e2e-preflight/io', async (original) => {
  const actual = await original<typeof import('../scripts/e2e-preflight/io')>()
  return { ...actual, writeReport: vi.fn() }
})

it.each([false, true])('并发保存串行执行，首写失败=%s 时后续报告仍可保存', async (failed) => {
  let settle!: () => void
  const pending = new Promise<void>((resolve, reject) => {
    settle = () => failed ? reject(new Error('first-save-failed')) : resolve()
  })
  const writer = vi.mocked(writeReport)
  writer.mockReset().mockReturnValueOnce(pending).mockResolvedValue(undefined)
  const session = new PreflightSession({} as PreflightReport, 'synthetic-report', 'synthetic-directory')
  const first = session.save().catch(error => error)
  const second = session.save()
  await Promise.resolve()
  expect(writer).toHaveBeenCalledTimes(1)
  settle()
  const result = await first
  await second
  expect(writer).toHaveBeenCalledTimes(2)
  if (failed) {
    expect(String(result)).toContain('first-save-failed')
  }
})
