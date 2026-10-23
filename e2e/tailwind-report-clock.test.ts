import type { CapabilityIdentity, CaseContract } from './tailwind-capabilities/types'
import fs from 'node:fs'
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { filesystemObservedAt } from './tailwind-capabilities/artifact-clock'
import { newReport, targetContext } from './tailwind-capabilities/context'
import { receipt, verifyReportArtifacts } from './tailwind-capabilities/report'

vi.mock('./tailwind-capabilities/identity', async importOriginal => ({
  ...await importOriginal<typeof import('./tailwind-capabilities/identity')>(),
  capabilityIdentity: async () => ({}) as CapabilityIdentity,
}))

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it.each([false, true])('同文件系统的本轮产物不受 Date 时钟超前影响；提前启动=%s', async (early) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tailwind-clock-'))
  try {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 60_000)
    const base = { root: directory, directory, runId: 'clock-regression' }
    const context = early ? targetContext(base, 'web-chromium') : base
    const file = path.join(context.directory, 'generated.css')
    if (early) {
      await writeFile(file, '.fixture{width:23px}')
    }
    const report = await newReport(context, 'web-chromium', [{} as CaseContract], {}, { browser: 'test' })
    if (early) {
      expect(report.observedAt).toBe(context.artifactStartedAt)
    }
    else {
      await writeFile(file, '.fixture{width:23px}')
    }
    report.artifacts.push(await receipt(file, context.directory, context.runId, ['fixture'], 'css'))
    await expect(verifyReportArtifacts(report, context.directory)).resolves.toBeUndefined()
    expect(await readdir(context.directory)).toEqual(['generated.css'])
    expect(await readFile(file, 'utf8')).toContain('width:23px')
    const old = new Date(Date.parse(report.observedAt) - 60_000)
    await utimes(file, old, old)
    await expect(verifyReportArtifacts(report, context.directory)).rejects.toThrow('早于本轮')
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('时钟采样与标记清理失败均保留，不能改用 Date 放行', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tailwind-clock-failure-'))
  try {
    const sample = new Error('sample failed')
    const cleanup = new Error('unlink failed')
    vi.spyOn(fs, 'fstatSync').mockImplementation(() => {
      throw sample
    })
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw cleanup
    })
    expect(() => filesystemObservedAt(directory)).toThrow(expect.objectContaining({ errors: [sample, cleanup], cause: sample }))
  }
  finally {
    vi.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  }
})
